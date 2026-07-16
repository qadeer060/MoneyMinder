# Deploying the MoneyMinder backend to PythonAnywhere

This is the JSON API only — no HTML pages here, those live in the separate
frontend repo deployed to Vercel.

## 1. Push this folder to GitHub
From inside `moneyminder-backend/`:
```
git init
git add .
git commit -m "MoneyMinder backend API"
git branch -M main
git remote add origin https://github.com/yourusername/moneyminder-backend.git
git push -u origin main
```
(Run each line separately — pasting them all at once into some Windows
terminals merges them into one broken command.)

## 2. On PythonAnywhere: clone and set up
Open a Bash console (Consoles tab → Bash):
```bash
git clone https://github.com/yourusername/moneyminder-backend.git
cd moneyminder-backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 3. Create the web app
- Web tab → **Add a new web app** → **Manual configuration** → same Python
  version as your venv.
- Set:
  - **Source code**: `/home/yourusername/moneyminder-backend`
  - **Working directory**: `/home/yourusername/moneyminder-backend`
  - **Virtualenv**: `/home/yourusername/moneyminder-backend/venv`

## 4. Edit the WSGI file
Click the WSGI file link on the Web tab, clear it, and paste:
```python
import sys

project_home = '/home/yourusername/moneyminder-backend'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

from app import app as application
```
Replace `yourusername` with your actual username.

## 5. Create the database
Back in the Bash console:
```bash
cd ~/moneyminder-backend
python3 -c "from app import app, db; app.app_context().push(); db.create_all()"
```

## 6. Reload
Web tab → **Reload**. Your API now lives at:
```
https://yourusername.pythonanywhere.com/api/...
```
Test it directly in the browser: visiting
`https://yourusername.pythonanywhere.com/api/health` should show
`{"status": "ok"}`.

## 7. Lock down CORS (optional but recommended once deployed)
Right now `CORS(app)` in `app.py` allows requests from any origin. Once you
know your Vercel URL, you can restrict it:
```python
CORS(app, origins=["https://your-frontend.vercel.app"])
```
Since auth uses a header token (not cookies), leaving it open isn't a
security hole in the way cookie-based CORS misconfigurations can be — but
locking it down is still good practice.

## Troubleshooting
- **CORS errors in the browser console**: check the Error log on the Web
  tab first — a CORS error in the console is often masking a 500 error
  underneath (Flask still needs to run successfully to attach CORS headers).
- **401 on every request from the frontend**: make sure `config.js` in the
  frontend points at this exact PythonAnywhere URL, including `https://`.
- Remember to click **Reload** on the Web tab after every change — no
  auto-restart.
