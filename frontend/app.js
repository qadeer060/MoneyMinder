// ---------------------------------------------------------------------------
// State & helpers
// ---------------------------------------------------------------------------

const CATEGORIES_FALLBACK = ["Food", "Travel", "Fun", "Bills", "Shopping", "Other"];

function getToken() {
    return localStorage.getItem("mm_token");
}

function setToken(token, username) {
    localStorage.setItem("mm_token", token);
    localStorage.setItem("mm_username", username);
}

function clearToken() {
    localStorage.removeItem("mm_token");
    localStorage.removeItem("mm_username");
}

function getUsername() {
    return localStorage.getItem("mm_username");
}

async function apiFetch(path, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    let data = {};
    try {
        data = await response.json();
    } catch (e) {
        // no JSON body (e.g. network error) — leave data empty
    }

    if (!response.ok) {
        // Session expired or invalid — bounce back to login
        if (response.status === 401 && path !== "/api/login") {
            clearToken();
            navigate("login");
        }
        throw new Error(data.error || "Something went wrong. Please try again.");
    }

    return data;
}

function showFlash(message, type = "success") {
    const container = document.getElementById("flash-container");
    const el = document.createElement("div");
    el.className = `flash flash-${type}`;
    el.textContent = message;
    container.innerHTML = "";
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

// ---------------------------------------------------------------------------
// View routing
// ---------------------------------------------------------------------------

function navigate(view) {
    document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");
    renderNav();

    if (view === "dashboard") loadDashboard();
    if (view === "add") loadAddForm();
}

function renderNav() {
    const nav = document.getElementById("nav-links");
    const token = getToken();

    if (token) {
        nav.innerHTML = `
            <span class="nav-user">Hi, ${getUsername()}</span>
            <a href="#" data-nav="dashboard">Dashboard</a>
            <a href="#" data-nav="add">Add Expense</a>
            <a href="#" id="logout-link">Log out</a>
        `;
        document.getElementById("logout-link").addEventListener("click", handleLogout);
    } else {
        nav.innerHTML = `
            <a href="#" data-nav="login">Log in</a>
            <a href="#" data-nav="signup">Sign up</a>
        `;
    }

    document.querySelectorAll("[data-nav]").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            navigate(el.dataset.nav);
        });
    });
}

// ---------------------------------------------------------------------------
// Auth handlers
// ---------------------------------------------------------------------------

document.getElementById("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("signup-username").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm").value;

    if (password !== confirm) {
        showFlash("Passwords don't match.", "error");
        return;
    }

    try {
        await apiFetch("/api/signup", {
            method: "POST",
            body: JSON.stringify({ username, password }),
        });
        showFlash("Account created! You can log in now.", "success");
        navigate("login");
    } catch (err) {
        showFlash(err.message, "error");
    }
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value;

    try {
        const data = await apiFetch("/api/login", {
            method: "POST",
            body: JSON.stringify({ username, password }),
        });
        setToken(data.token, data.username);
        navigate("dashboard");
    } catch (err) {
        showFlash(err.message, "error");
    }
});

async function handleLogout(e) {
    e.preventDefault();
    try {
        await apiFetch("/api/logout", { method: "POST" });
    } catch (err) {
        // even if this fails (e.g. token already gone), still log out locally
    }
    clearToken();
    navigate("login");
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function loadDashboard() {
    try {
        const data = await apiFetch("/api/expenses");
        renderDashboard(data);
    } catch (err) {
        showFlash(err.message, "error");
    }
}

function renderDashboard(data) {
    document.getElementById("total-value").textContent = `$${data.total.toFixed(2)}`;

    // Pre-fill the budget input with whatever's already saved
    const budgetInput = document.getElementById("budget-input");
    if (document.activeElement !== budgetInput) {
        budgetInput.value = data.budget ? data.budget : "";
    }

    renderBudgetBanner(data.budget_status);
    renderBudgetProgress(data.budget_status);

    const totalPercentText = document.getElementById("total-percent-text");
    totalPercentText.textContent = data.budget_status
        ? `${data.budget_status.percent_used}% of your $${data.budget_status.budget.toFixed(2)} budget`
        : "";

    const breakdownList = document.getElementById("breakdown-list");
    const categories = Object.keys(data.breakdown).sort();
    breakdownList.innerHTML = categories.length
        ? categories
              .map(
                  (cat) => `
            <li>
                <span class="category-tag">${escapeHtml(cat)}</span>
                <span class="category-amount">$${data.breakdown[cat].toFixed(2)}</span>
            </li>`
              )
              .join("")
        : '<p class="empty-text">No categories yet.</p>';

    const wrap = document.getElementById("expense-table-wrap");
    if (!data.expenses.length) {
        wrap.innerHTML = '<p class="empty-text">No expenses yet. <a href="#" data-nav="add">Add your first one</a>.</p>';
        wrap.querySelector("[data-nav]").addEventListener("click", (e) => {
            e.preventDefault();
            navigate("add");
        });
        return;
    }

    const rows = data.expenses
        .map(
            (exp) => `
        <tr>
            <td>${escapeHtml(exp.item)}</td>
            <td><span class="category-tag">${escapeHtml(exp.category)}</span></td>
            <td>$${exp.amount.toFixed(2)}</td>
            <td>${exp.percent_of_budget !== null && exp.percent_of_budget !== undefined ? exp.percent_of_budget + "%" : "—"}</td>
            <td>${escapeHtml(exp.created_at)}</td>
            <td><button class="btn-delete" data-id="${exp.id}" title="Delete">✕</button></td>
        </tr>`
        )
        .join("");

    wrap.innerHTML = `
        <table class="expense-table">
            <thead>
                <tr><th>Item</th><th>Category</th><th>Amount</th><th>% of Budget</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;

    wrap.querySelectorAll(".btn-delete").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!confirm("Delete this expense? This can't be undone.")) return;
            try {
                await apiFetch(`/api/expenses/${btn.dataset.id}`, { method: "DELETE" });
                showFlash("Expense deleted.", "success");
                loadDashboard();
            } catch (err) {
                showFlash(err.message, "error");
            }
        });
    });
}

function renderBudgetBanner(status) {
    const banner = document.getElementById("budget-banner");
    if (!status) {
        banner.innerHTML = "";
        return;
    }
    if (status.level === "over") {
        banner.innerHTML = `<div class="flash flash-error">You've gone over your monthly budget — you're at ${status.percent_used}% of $${status.budget.toFixed(2)}.</div>`;
    } else if (status.level === "warning") {
        banner.innerHTML = `<div class="flash flash-warning">Heads up — you're at ${status.percent_used}% of your monthly budget ($${status.budget.toFixed(2)}).</div>`;
    } else {
        banner.innerHTML = "";
    }
}

function renderBudgetProgress(status) {
    const wrap = document.getElementById("budget-progress-wrap");
    if (!status) {
        wrap.innerHTML = '<p class="empty-text">Set a monthly budget to track how close you are to it.</p>';
        return;
    }
    const pct = Math.min(status.percent_used, 100);
    const levelClass = status.level === "over" ? "over" : status.level === "warning" ? "warning" : "ok";
    wrap.innerHTML = `
        <div class="progress-track">
            <div class="progress-fill progress-${levelClass}" style="width: ${pct}%"></div>
        </div>
        <p class="progress-label">${status.percent_used}% of $${status.budget.toFixed(2)} used</p>
    `;
}

document.getElementById("budget-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const budget = document.getElementById("budget-input").value;
    try {
        await apiFetch("/api/budget", {
            method: "POST",
            body: JSON.stringify({ budget }),
        });
        showFlash("Budget saved.", "success");
        loadDashboard();
    } catch (err) {
        showFlash(err.message, "error");
    }
});

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Add expense
// ---------------------------------------------------------------------------

async function loadAddForm() {
    const select = document.getElementById("add-category");
    let categories = CATEGORIES_FALLBACK;
    try {
        const data = await apiFetch("/api/expenses");
        categories = data.categories || categories;
    } catch (err) {
        // fall back silently to the default category list
    }
    select.innerHTML =
        '<option value="" disabled selected>Choose a category</option>' +
        categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
}

document.getElementById("add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const item = document.getElementById("add-item").value.trim();
    const amount = document.getElementById("add-amount").value;
    const category = document.getElementById("add-category").value;

    try {
        const result = await apiFetch("/api/expenses", {
            method: "POST",
            body: JSON.stringify({ item, amount, category }),
        });
        const pct = result.expense && result.expense.percent_of_budget;
        const msg = pct !== null && pct !== undefined
            ? `Added "${item}" — that's ${pct}% of your monthly budget.`
            : `Added "${item}".`;
        showFlash(msg, "success");
        document.getElementById("add-form").reset();
        navigate("dashboard");
    } catch (err) {
        showFlash(err.message, "error");
    }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

navigate(getToken() ? "dashboard" : "login");
