"""
MoneyMinder — Backend API (Flask)
----------------------------------
A JSON API only — no HTML rendering. Meant to run on PythonAnywhere while
a separate static frontend (on Vercel) talks to it over fetch().

Auth model: token-based, not cookies. On login we hand back a random token;
the frontend stores it (in localStorage) and sends it back on every request
as:  Authorization: Bearer <token>
This avoids cross-domain cookie headaches entirely, since the frontend and
backend live on different domains (vercel.app vs pythonanywhere.com).

Run locally with: python app.py
"""

import os
import secrets
from datetime import datetime
from functools import wraps

from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(
    BASE_DIR, "moneyminder.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

# Allow the frontend (any origin) to call this API. Since auth uses a
# header token rather than cookies, there's no session/credential leakage
# risk in allowing "*" here — feel free to lock this to your exact Vercel
# URL later (see DEPLOY notes).
CORS(app)

CATEGORIES = ["Food", "Travel", "Fun", "Bills", "Shopping", "Other"]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    token = db.Column(db.String(64), unique=True, nullable=True)
    expenses = db.relationship(
        "Expense", backref="user", lazy=True, cascade="all, delete-orphan"
    )

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def generate_token(self):
        self.token = secrets.token_hex(32)
        return self.token


class Expense(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    item = db.Column(db.String(120), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "item": self.item,
            "amount": self.amount,
            "category": self.category,
            "created_at": self.created_at.strftime("%b %d, %Y"),
        }


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

def token_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401

        token = auth_header.split(" ", 1)[1].strip()
        user = User.query.filter_by(token=token).first()
        if not user:
            return jsonify({"error": "Invalid or expired token"}), 401

        request.current_user = user
        return f(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    if len(password) < 4:
        return jsonify({"error": "Password must be at least 4 characters"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "That username is already taken"}), 409

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({"message": "Account created. You can log in now."}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid username or password"}), 401

    token = user.generate_token()
    db.session.commit()

    return jsonify({"token": token, "username": user.username})


@app.route("/api/logout", methods=["POST"])
@token_required
def logout():
    request.current_user.token = None
    db.session.commit()
    return jsonify({"message": "Logged out"})


@app.route("/api/me", methods=["GET"])
@token_required
def me():
    return jsonify({"username": request.current_user.username})


# ---------------------------------------------------------------------------
# Expense routes
# ---------------------------------------------------------------------------

@app.route("/api/expenses", methods=["GET"])
@token_required
def get_expenses():
    user_expenses = (
        Expense.query.filter_by(user_id=request.current_user.id)
        .order_by(Expense.created_at.desc())
        .all()
    )

    total = sum(e.amount for e in user_expenses)
    breakdown = {}
    for e in user_expenses:
        breakdown[e.category] = breakdown.get(e.category, 0) + e.amount

    return jsonify({
        "expenses": [e.to_dict() for e in user_expenses],
        "total": total,
        "breakdown": breakdown,
        "categories": CATEGORIES,
    })


@app.route("/api/expenses", methods=["POST"])
@token_required
def add_expense():
    data = request.get_json(silent=True) or {}
    item = (data.get("item") or "").strip()
    category = (data.get("category") or "").strip()
    amount_raw = data.get("amount")

    try:
        amount = float(amount_raw)
    except (TypeError, ValueError):
        return jsonify({"error": "Please enter a valid number for the amount"}), 400

    if not item:
        return jsonify({"error": "Please enter what you bought"}), 400
    if not category:
        return jsonify({"error": "Please choose a category"}), 400
    if amount <= 0:
        return jsonify({"error": "Amount must be greater than zero"}), 400

    expense = Expense(
        item=item, amount=amount, category=category, user_id=request.current_user.id
    )
    db.session.add(expense)
    db.session.commit()

    return jsonify({"message": "Expense added", "expense": expense.to_dict()}), 201


@app.route("/api/expenses/<int:expense_id>", methods=["DELETE"])
@token_required
def delete_expense(expense_id):
    expense = Expense.query.get_or_404(expense_id)
    if expense.user_id != request.current_user.id:
        return jsonify({"error": "You can't delete someone else's expense"}), 403

    db.session.delete(expense)
    db.session.commit()
    return jsonify({"message": "Expense deleted"})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(debug=True)
