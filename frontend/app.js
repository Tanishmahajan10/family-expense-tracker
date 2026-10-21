
const API = "https://family-expense-tracker-p9os.onrender.com";

let token = localStorage.getItem("session_token");
let user = JSON.parse(localStorage.getItem("user") || "null");
let expenses = [];
let editingId = null;

const $ = id => document.getElementById(id);

// Toast notifications
function showToast(message, type = "") {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.className = "toast";
  }, 2500);
}

// Format currency
function money(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });
}

// Format dates
function formatDate(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

// API headers
function headers() {
  return {
    "Content-Type": "application/json",
    "session_token": token
  };
}

// API helper
async function api(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: options.headers || headers()
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.detail || "Something went wrong");
  }

  return data;
}

// Show dashboard
function showDashboard() {
  $("authScreen").classList.add("hidden");
  $("dashboard").classList.remove("hidden");

  $("userName").textContent = user?.name || "User";
  $("userAvatar").textContent =
    (user?.name || "U").charAt(0).toUpperCase();

  $("date").value = new Date().toISOString().split("T")[0];

  loadExpenses();
}

// Show authentication screen
function showAuth() {
  $("dashboard").classList.add("hidden");
  $("authScreen").classList.remove("hidden");
}

// Render expenses
function renderExpenses() {
  const list = $("expenseList");
  list.innerHTML = "";

  let total = 0;

  expenses.forEach(expense => {
    total += Number(expense.amount);

    const item = document.createElement("div");
    item.className = "expense";

    item.innerHTML = `
      <div class="expense-info">
        <div class="expense-title">
          ${escapeHTML(expense.category)}
        </div>

        <div class="expense-meta">
          ${formatDate(expense.date)} · Added by
          ${escapeHTML(expense.added_by || "Unknown")}
        </div>

        <div class="actions">
          <button
            class="btn-small btn-light"
            onclick="openEdit(${expense.id})"
          >
            Edit
          </button>

          <button
            class="btn-small btn-danger"
            onclick="deleteExpense(${expense.id})"
          >
            Delete
          </button>
        </div>
      </div>

      <div class="expense-amount">
        ${money(expense.amount)}
      </div>
    `;

    list.appendChild(item);
  });

  $("totalCount").textContent = expenses.length;
  $("totalAmount").textContent = money(total);

  if (!expenses.length) {
    list.innerHTML = `
      <div class="empty">
        No expenses found. Add your first expense above.
      </div>
    `;
  }
}

// Load expenses and dashboard summaries
async function loadExpenses() {
  try {
    expenses = await api("/expenses");

    renderExpenses();

    await Promise.all([
      loadMonthTotal(),
      loadYearTotal(),
      loadMemberSummary()
    ]);
  } catch (error) {
    showToast(error.message, "error");
  }
}

// Current month's total
async function loadMonthTotal() {
  const now = new Date();

  const data = await api(
    `/expenses/summary/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`
  );

  $("monthAmount").textContent = money(data.total_expense);
}

// Current year's total
async function loadYearTotal() {
  const year = new Date().getFullYear();

  const data = await api(
    `/expenses/summary_by_year?year=${year}`
  );

  const total = Object.values(data.monthly_totals || {}).reduce(
    (sum, value) => sum + Number(value),
    0
  );

  $("yearAmount").textContent = money(total);
}

// Login and join tabs
$("loginTab").onclick = () => {
  $("loginTab").classList.add("active");
  $("joinTab").classList.remove("active");

  $("loginForm").classList.remove("hidden");
  $("joinForm").classList.add("hidden");
};

$("joinTab").onclick = () => {
  $("joinTab").classList.add("active");
  $("loginTab").classList.remove("active");

  $("joinForm").classList.remove("hidden");
  $("loginForm").classList.add("hidden");
};

// Login
$("loginForm").onsubmit = async event => {
  event.preventDefault();

  try {
    const data = await api("/families/login", {
      method: "POST",
      body: JSON.stringify({
        family_code: $("loginFamilyCode").value.trim(),
        name: $("loginName").value.trim(),
        pin: $("loginPin").value.trim()
      })
    });

    token = data.session_token;
    user = data;

    localStorage.setItem("session_token", token);
    localStorage.setItem("user", JSON.stringify(user));

    showToast("Login successful", "success");
    showDashboard();
  } catch (error) {
    showToast(error.message, "error");
  }
};

// Join an existing family
$("joinForm").onsubmit = async event => {
  event.preventDefault();

  try {
    const data = await api("/families/join", {
      method: "POST",
      body: JSON.stringify({
        family_code: $("joinFamilyCode").value.trim(),
        name: $("joinName").value.trim(),
        pin: $("joinPin").value.trim()
      })
    });

    showToast(data.message, "success");
    $("joinForm").reset();
  } catch (error) {
    showToast(error.message, "error");
  }
};

// Create a family
$("familyForm").onsubmit = async event => {
  event.preventDefault();

  try {
    const data = await api("/families", {
      method: "POST",
      body: JSON.stringify({
        name: $("familyName").value.trim()
      })
    });

    const result = $("familyResult");
    result.classList.remove("hidden");

    result.innerHTML = `
      <strong>${escapeHTML(data.family_name)}</strong> created.<br />
      Share this family code:
      <strong>${escapeHTML(data.entry_code)}</strong>
    `;

    $("familyForm").reset();

    showToast("Family created", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
};

// Add an expense
$("expenseForm").onsubmit = async event => {
  event.preventDefault();

  try {
    await api("/expenses", {
      method: "POST",
      body: JSON.stringify({
        amount: Number($("amount").value),
        category: $("category").value.trim(),
        date: $("date").value
      })
    });

    $("expenseForm").reset();
    $("date").value = new Date().toISOString().split("T")[0];

    showToast("Expense added", "success");

    await loadExpenses();
  } catch (error) {
    showToast(error.message, "error");
  }
};

// Delete an expense
async function deleteExpense(id) {
  if (!confirm("Delete this expense?")) return;

  try {
    await api(`/expenses/${id}`, {
      method: "DELETE"
    });

    showToast("Expense deleted", "success");

    await loadExpenses();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// Open edit modal
function openEdit(id) {
  const expense = expenses.find(item => item.id === id);

  if (!expense) return;

  editingId = id;

  $("editAmount").value = expense.amount;
  $("editCategory").value = expense.category;
  $("editDate").value = expense.date;

  $("editModal").classList.remove("hidden");
}

// Close edit modal
$("closeEdit").onclick = () => {
  $("editModal").classList.add("hidden");
  editingId = null;
};

// Update an expense
$("editForm").onsubmit = async event => {
  event.preventDefault();

  if (editingId === null) return;

  try {
    await api(`/expenses/${editingId}`, {
      method: "PUT",
      body: JSON.stringify({
        amount: Number($("editAmount").value),
        category: $("editCategory").value.trim(),
        date: $("editDate").value
      })
    });

    $("editModal").classList.add("hidden");
    editingId = null;

    showToast("Expense updated", "success");

    await loadExpenses();
  } catch (error) {
    showToast(error.message, "error");
  }
};

// Monthly summary button
$("loadMonthly").onclick = async () => {
  const year = $("summaryYear").value;
  const month = $("summaryMonth").value;
  const result = $("monthlyResult");

  if (!year || !month) {
    showToast("Select year and month", "error");
    return;
  }

  try {
    const data = await api(
      `/expenses/summary/monthly?year=${year}&month=${month}`
    );

    result.classList.remove("hidden");

    result.innerHTML = `
      Total for <strong>${month}/${year}</strong>:
      <strong>${money(data.total_expense)}</strong>
    `;
  } catch (error) {
    showToast(error.message, "error");
  }
};

// Member summary
async function loadMemberSummary() {
  const container = $("memberSummary");

  if (!container) return;

  try {
    container.innerHTML = `
      <div class="empty">Loading member expenses...</div>
    `;

    const data = await api("/expenses/summary_by_member");
    const members = data.member_summary || [];

    if (!members.length) {
      container.innerHTML = `
        <div class="empty">No family members found.</div>
      `;
      return;
    }

    container.innerHTML = members.map(member => `
      <div class="summary-item">
        <span>${escapeHTML(member.member_name || "Unknown member")}</span>
        <strong>${money(member.total_expense)}</strong>
      </div>
    `).join("");
  } catch (error) {
    console.error("Member summary failed:", error);

    container.innerHTML = `
      <div class="empty">Could not load member expenses.</div>
    `;

    showToast(error.message, "error");
  }
}

// Escape HTML to prevent user-entered text being treated as markup
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Yearly breakdown button
$("loadYearly").onclick = async () => {
  const year = $("yearlyYear").value;
  const result = $("yearlyResult");

  if (!year) {
    showToast("Enter a year", "error");
    return;
  }

  try {
    const data = await api(
      `/expenses/summary_by_year?year=${year}`
    );

    const months = data.monthly_totals || {};
    const entries = Object.entries(months);

    result.classList.remove("hidden");

    if (!entries.length) {
      result.innerHTML = "No expenses found for this year.";
      return;
    }

    result.innerHTML = `
      <div class="summary-grid">
        ${entries.map(([month, amount]) => `
          <div class="summary-item">
            <span>Month ${escapeHTML(month)}</span>
            <strong>${money(amount)}</strong>
          </div>
        `).join("")}
      </div>
    `;
  } catch (error) {
    showToast(error.message, "error");
  }
};

// Logout
$("logoutBtn").onclick = () => {
  localStorage.removeItem("session_token");
  localStorage.removeItem("user");

  token = null;
  user = null;

  showAuth();
};

// Initial screen
if (token && user) {
  showDashboard();
} else {
  showAuth();
}
