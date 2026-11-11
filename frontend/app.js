
// Determine backend API URL automatically:
// 1. window.API_BASE_URL (explicit programmatic override)
// 2. localStorage.getItem("api_url") (user-configured override)
// 3. Localhost development: port 5500 / 3000 -> http://127.0.0.1:8000
// 4. Meta tag <meta name="api-base-url" content="..."> in index.html
// 5. Render Frontend Static Site: route to Render Backend Web Service
// 6. Direct FastAPI host or custom unified domain: window.location.origin
function getApiBaseUrl() {
  if (typeof window !== "undefined" && window.API_BASE_URL) {
    return window.API_BASE_URL;
  }
  const stored = localStorage.getItem("api_url");
  if (stored) return stored.replace(/\/+$/, "");

  const loc = window.location;
  // Local development on Live Server (e.g. port 5500, 3000, 5173) or file://
  if (loc.protocol === "file:" || ((loc.hostname === "localhost" || loc.hostname === "127.0.0.1") && loc.port && loc.port !== "8000")) {
    return `http://${loc.hostname || "127.0.0.1"}:8000`;
  }

  const metaTag = document.querySelector('meta[name="api-base-url"]');
  if (metaTag && metaTag.content && !metaTag.content.startsWith("%")) {
    return metaTag.content.replace(/\/+$/, "");
  }

  if (loc.hostname && loc.hostname.includes("family-expense-tracker-frontend.onrender.com")) {
    return "https://family-expense-tracker-p9os.onrender.com";
  }

  // Vercel deployment support: route requests to Render backend
  if (loc.hostname && (loc.hostname.endsWith(".vercel.app") || loc.hostname.includes("vercel.app"))) {
    return "https://family-expense-tracker-p9os.onrender.com";
  }

  if (loc.origin && loc.origin !== "null") {
    return loc.origin;
  }

  return "http://127.0.0.1:8000";
}

const API = getApiBaseUrl();

let token = localStorage.getItem("session_token");
let user = null;
try {
  user = JSON.parse(localStorage.getItem("user") || "null");
} catch {
  user = null;
  localStorage.removeItem("user");
}
let expenses = [];
let selectedCategory = "ALL";
let editingId = null;

// Spending by Category Chart Month State
const currentDateObj = new Date();
const currentRealYear = currentDateObj.getFullYear();
const currentRealMonth = currentDateObj.getMonth(); // 0-indexed (0=Jan, 11=Dec)

let chartYear = null;
let chartMonth = null;

const KNOWN_CATEGORIES = [
  "Food", "Travel", "Shopping", "Bills", "Education",
  "Health", "Entertainment", "Grocery", "Groceries", "Transport", "Other"
];

const CATEGORY_COLORS = {
  "Food": "#18745e",
  "Travel": "#2563eb",
  "Transport": "#0284c7",
  "Shopping": "#d97706",
  "Bills": "#d65b50",
  "Education": "#7c3aed",
  "Health": "#059669",
  "Entertainment": "#db2777",
  "Grocery": "#16a34a",
  "Grocery": "#16a34a",
  "Other": "#64748b"
};

// Extracts main/parent category (e.g., "Food (Sweets)" -> "Food", "Other (Books)" -> "Other")
function getMainCategory(rawCategory) {
  if (!rawCategory) return "Other";
  let str = String(rawCategory).trim();
  if (!str) return "Other";

  // Check parenthetical subcategory: "Food (Sweets)" -> "Food"
  if (str.includes("(")) {
    const parent = str.split("(")[0].trim();
    if (parent) {
      str = parent;
    }
  } else {
    // Check delimiter with surrounding spaces e.g. "Food - Sweets", "Food: Sweets", "Food / Sweets"
    const parts = str.split(/\s*[:\-\/]\s+/);
    if (parts.length > 1 && parts[0].trim()) {
      const candidate = parts[0].trim();
      if (KNOWN_CATEGORIES.some(k => k.toLowerCase() === candidate.toLowerCase())) {
        str = candidate;
      }
    }
  }

  // Normalize casing for known categories
  const matched = KNOWN_CATEGORIES.find(k => k.toLowerCase() === str.toLowerCase());
  if (matched) return matched;

  // Title-case custom main categories
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Check if an expense matches the selected category filter
function matchesCategoryFilter(expense, targetCategory) {
  if (!targetCategory || targetCategory === "ALL") return true;

  const raw = String(expense.category || "").trim().toLowerCase();
  const main = getMainCategory(expense.category).toLowerCase();
  const target = String(targetCategory).trim().toLowerCase();

  // 1. Direct or main category match
  if (main === target || raw === target) return true;

  // 2. Prefix match (e.g. raw is "Food (Mawa)" and target is "Food")
  if (
    raw.startsWith(target + " (") ||
    raw.startsWith(target + " -") ||
    raw.startsWith(target + ":") ||
    raw.startsWith(target + "/")
  ) {
    return true;
  }

  // 3. Common synonyms
  if ((target === "grocery" || target === "groceries") && (main === "grocery" || main === "groceries" || raw.includes("grocer"))) {
    return true;
  }
  if ((target === "travel" || target === "transport") && (main === "travel" || main === "transport" || raw.includes("travel") || raw.includes("transport"))) {
    return true;
  }

  return false;
}

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
  let res;
  try {
    res = await fetch(API + path, {
      ...options,
      headers: options.headers || headers()
    });
  } catch (err) {
    throw new Error(`Cannot connect to server at ${API}. Please check your connection.`);
  }

  const contentType = res.headers.get("content-type") || "";
  let data;

  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else {
    const rawText = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Server returned error ${res.status}: ${rawText.slice(0, 120) || res.statusText}`);
    } else {
      // Received 200 OK but with HTML! This means the request hit a static site or fallback page, NOT the API!
      throw new Error(`Configuration Error: Received HTML instead of JSON from ${API + path}. The frontend is connecting to a static web server instead of the backend API.`);
    }
  }

  if (!data) {
    throw new Error("Invalid response received from server.");
  }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("session_token");
      localStorage.removeItem("user");
      token = null;
      user = null;
      showAuth();
    }
    const errorMsg = Array.isArray(data.detail)
      ? data.detail.map(d => d.msg || JSON.stringify(d)).join(", ")
      : (data.detail || "Something went wrong");
    throw new Error(errorMsg);
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

  chartYear = null;
  chartMonth = null;
  selectedCategory = "ALL";
  if ($("categoryFilter")) {
    $("categoryFilter").value = "ALL";
  }

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

  // 1. Overall stats from all loaded expenses
  let overallTotal = 0;
  expenses.forEach(expense => {
    overallTotal += Number(expense.amount || 0);
  });
  $("totalCount").textContent = expenses.length;
  $("totalAmount").textContent = money(overallTotal);

  // 2. Filter expenses based on selectedCategory (supports parent categories and subcategories)
  const displayedExpenses = selectedCategory === "ALL"
    ? expenses
    : expenses.filter(e => matchesCategoryFilter(e, selectedCategory));

  displayedExpenses.forEach(expense => {
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

  if (!displayedExpenses.length) {
    if (expenses.length > 0 && selectedCategory !== "ALL") {
      list.innerHTML = `
        <div class="empty">
          No expenses found for "${escapeHTML(selectedCategory)}".
        </div>
      `;
    } else {
      list.innerHTML = `
        <div class="empty">
          No expenses found. Add your first expense above.
        </div>
      `;
    }
  }
}

// Dynamically populate category filter options based on family's recorded expenses
function updateCategoryFilter() {
  const select = $("categoryFilter");
  if (!select) return;

  const currentSelection = selectedCategory || select.value || "ALL";

  // Collect distinct main categories used by the family
  const familyCategories = new Set();
  expenses.forEach(e => {
    const main = getMainCategory(e.category);
    if (main) familyCategories.add(main);
  });

  // Base list of standard categories
  const defaultList = [
    "Food", "Bills", "Grocery", "Travel", "Shopping",
    "Education", "Health", "Entertainment", "Other"
  ];

  // Merge family categories with defaults, sorting alphabetically
  const allCats = new Set([...familyCategories, ...defaultList]);
  const sortedCats = Array.from(allCats).sort((a, b) => a.localeCompare(b));

  let optionsHtml = `<option value="ALL">All Categories (${expenses.length})</option>`;
  sortedCats.forEach(cat => {
    const count = expenses.filter(e => matchesCategoryFilter(e, cat)).length;
    const countLabel = count > 0 ? ` (${count})` : "";
    optionsHtml += `<option value="${escapeHTML(cat)}">${escapeHTML(cat)}${countLabel}</option>`;
  });

  select.innerHTML = optionsHtml;

  // Restore current selection if it still exists
  const hasSelection = Array.from(select.options).some(opt => opt.value.toLowerCase() === currentSelection.toLowerCase());
  if (hasSelection) {
    select.value = currentSelection;
  } else {
    select.value = "ALL";
    selectedCategory = "ALL";
  }
}

// Helpers for Month Navigation
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Extract only the distinct months that actually contain expenses for the family
function getAvailableExpenseMonths() {
  const monthMap = new Map();

  expenses.forEach(exp => {
    if (!exp.date) return;
    const parts = String(exp.date).split("-");
    if (parts.length < 2) return;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // 0-indexed (0=Jan, 11=Dec)
    if (isNaN(y) || isNaN(m) || m < 0 || m > 11) return;

    const key = `${y}-${m}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, { year: y, month: m });
    }
  });

  // Sort descending: newest (highest year, highest month) first
  return Array.from(monthMap.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

// Select default month: current month if it has expenses, else most recent month with expenses
function selectDefaultChartMonth(availableMonths) {
  if (!availableMonths.length) {
    chartYear = currentRealYear;
    chartMonth = currentRealMonth;
    return;
  }

  // Preserve user selection if it still exists in available months
  if (chartYear !== null && chartMonth !== null) {
    const exists = availableMonths.some(m => m.year === chartYear && m.month === chartMonth);
    if (exists) return;
  }

  // Check if current calendar month has expenses
  const currentHasExpenses = availableMonths.some(m => m.year === currentRealYear && m.month === currentRealMonth);
  if (currentHasExpenses) {
    chartYear = currentRealYear;
    chartMonth = currentRealMonth;
    return;
  }

  // Otherwise, select the most recent month containing expenses
  chartYear = availableMonths[0].year;
  chartMonth = availableMonths[0].month;
}

// Populate dropdown and controls using ONLY months with expenses
function updateChartControls(availableMonths) {
  const select = $("chartMonthSelect");
  const prevBtn = $("prevMonthBtn");
  const nextBtn = $("nextMonthBtn");

  if (select) {
    select.innerHTML = "";

    if (!availableMonths.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No expenses";
      select.appendChild(opt);
      select.disabled = true;
    } else {
      select.disabled = false;
      availableMonths.forEach(mObj => {
        const opt = document.createElement("option");
        opt.value = `${mObj.year}-${mObj.month}`;
        opt.textContent = `${monthNames[mObj.month]} ${mObj.year}`;
        select.appendChild(opt);
      });
      select.value = `${chartYear}-${chartMonth}`;
    }
  }

  // Update previous/next navigation buttons
  // availableMonths is sorted newest (index 0) to oldest (last index)
  if (!availableMonths.length || availableMonths.length <= 1) {
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
  } else {
    const currentIndex = availableMonths.findIndex(m => m.year === chartYear && m.month === chartMonth);
    if (prevBtn) {
      // Previous (older) button: disabled if already at the oldest month with expenses
      prevBtn.disabled = (currentIndex === -1 || currentIndex >= availableMonths.length - 1);
    }
    if (nextBtn) {
      // Next (newer) button: disabled if already at the newest month with expenses
      nextBtn.disabled = (currentIndex === -1 || currentIndex <= 0);
    }
  }
}

// Move to next available older month containing expenses
function prevMonth() {
  const availableMonths = getAvailableExpenseMonths();
  if (availableMonths.length <= 1) return;

  const currentIndex = availableMonths.findIndex(m => m.year === chartYear && m.month === chartMonth);
  if (currentIndex === -1) {
    const older = availableMonths.find(m => m.year < chartYear || (m.year === chartYear && m.month < chartMonth));
    if (older) {
      chartYear = older.year;
      chartMonth = older.month;
    }
  } else if (currentIndex < availableMonths.length - 1) {
    chartYear = availableMonths[currentIndex + 1].year;
    chartMonth = availableMonths[currentIndex + 1].month;
  }

  renderCategoryPieChart();
}

// Move to next available newer month containing expenses
function nextMonth() {
  const availableMonths = getAvailableExpenseMonths();
  if (availableMonths.length <= 1) return;

  const currentIndex = availableMonths.findIndex(m => m.year === chartYear && m.month === chartMonth);
  if (currentIndex === -1) {
    const newerMonths = availableMonths.filter(m => m.year > chartYear || (m.year === chartYear && m.month > chartMonth));
    if (newerMonths.length > 0) {
      const nearestNewer = newerMonths[newerMonths.length - 1];
      chartYear = nearestNewer.year;
      chartMonth = nearestNewer.month;
    }
  } else if (currentIndex > 0) {
    chartYear = availableMonths[currentIndex - 1].year;
    chartMonth = availableMonths[currentIndex - 1].month;
  }

  renderCategoryPieChart();
}

// Direct month selection from dropdown
function onChartMonthSelect(val) {
  if (!val) return;
  const parts = String(val).split("-");
  if (parts.length < 2) return;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);

  if (isNaN(y) || isNaN(m) || m < 0 || m > 11) return;

  chartYear = y;
  chartMonth = m;
  renderCategoryPieChart();
}

// Setup high-DPI canvas for razor-sharp rendering on Retina/mobile OLED screens
function setupHighDpiCanvas(canvas, displaySize = 220) {
  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(displaySize * dpr);
  canvas.height = Math.round(displaySize * dpr);
  canvas.style.width = `${displaySize}px`;
  canvas.style.height = `${displaySize}px`;

  const ctx = canvas.getContext("2d");
  if (ctx.resetTransform) {
    ctx.resetTransform();
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, displaySize, displaySize);
  return { ctx, size: displaySize };
}

// Render category spending pie chart for selected month
function renderCategoryPieChart() {
  const canvas = $("categoryPieCanvas");
  const legend = $("chartLegend");
  const periodLabel = $("chartPeriodLabel");
  if (!canvas || !legend) return;

  const availableMonths = getAvailableExpenseMonths();
  selectDefaultChartMonth(availableMonths);
  updateChartControls(availableMonths);

  const displayMonthName = monthNames[chartMonth] || "Month";

  if (!availableMonths.length) {
    if (periodLabel) {
      periodLabel.textContent = "No expenses recorded";
    }

    const { ctx, size } = setupHighDpiCanvas(canvas, 220);
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = Math.min(centerX, centerY) - 14;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = "#e3ebe6";
    ctx.lineWidth = 18;
    ctx.stroke();

    ctx.fillStyle = "#75827d";
    ctx.font = "600 13px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No data", centerX, centerY);

    legend.innerHTML = `
      <div class="chart-empty-state">
        <p>No expenses recorded yet.</p>
        <small>Add an expense above to see your category breakdown.</small>
      </div>
    `;
    return;
  }

  if (periodLabel) {
    periodLabel.textContent = `${displayMonthName} ${chartYear} breakdown`;
  }

  // Filter expenses for selected chartYear and chartMonth (timezone-safe)
  const monthExpenses = expenses.filter(expense => {
    if (!expense.date) return false;
    const parts = String(expense.date).split("-");
    if (parts.length < 2) return false;
    const expY = parseInt(parts[0], 10);
    const expM = parseInt(parts[1], 10) - 1;
    return expY === chartYear && expM === chartMonth;
  });

  // Calculate totals aggregated by main category
  const categoryTotals = {};
  let monthTotal = 0;

  monthExpenses.forEach(e => {
    const cat = getMainCategory(e.category);
    const amt = Number(e.amount || 0);
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
    monthTotal += amt;
  });

  const categories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);

  // Clean and prepare canvas with Retina high-DPI scaling
  const { ctx, size } = setupHighDpiCanvas(canvas, 220);

  // If no expenses for selected month, show clean empty state
  if (!categories.length || monthTotal === 0) {
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = Math.min(centerX, centerY) - 14;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = "#e3ebe6";
    ctx.lineWidth = 18;
    ctx.stroke();

    ctx.fillStyle = "#75827d";
    ctx.font = "600 13px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("No data", centerX, centerY);

    legend.innerHTML = `
      <div class="chart-empty-state">
        <p>No expenses recorded for ${escapeHTML(displayMonthName)} ${chartYear}.</p>
        <small>Select another month with recorded expenses.</small>
      </div>
    `;
    return;
  }

  // Draw Pie / Donut Chart with sharp rendering
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = Math.min(centerX, centerY) - 16;
  const innerRadius = radius * 0.55; // Clean modern donut chart style

  let startAngle = -0.5 * Math.PI; // Start at 12 o'clock

  categories.forEach(cat => {
    const amount = categoryTotals[cat];
    const sliceAngle = (amount / monthTotal) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    const color = CATEGORY_COLORS[cat] || "#64748b";

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    startAngle = endAngle;
  });

  // Center label inside donut (crisp font rendering)
  ctx.fillStyle = "#172b27";
  ctx.font = "700 15px Manrope, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(money(monthTotal), centerX, centerY - 6);

  ctx.fillStyle = "#75827d";
  ctx.font = "600 10px 'DM Sans', sans-serif";
  ctx.fillText("Total Spent", centerX, centerY + 11);

  // Render Legend
  legend.innerHTML = categories.map(cat => {
    const amount = categoryTotals[cat];
    const pct = ((amount / monthTotal) * 100).toFixed(1);
    const color = CATEGORY_COLORS[cat] || "#64748b";

    return `
      <div class="chart-legend-item">
        <div class="chart-legend-label">
          <span class="chart-legend-dot" style="background: ${color};"></span>
          <span class="chart-legend-cat">${escapeHTML(cat)}</span>
        </div>
        <div class="chart-legend-numbers">
          <span class="chart-legend-pct">${pct}%</span>
          <strong class="chart-legend-amt">${money(amount)}</strong>
        </div>
      </div>
    `;
  }).join("");
}

// Load expenses and dashboard summaries
async function loadExpenses() {
  try {
    expenses = await api("/expenses");

    updateCategoryFilter();
    renderExpenses();
    renderCategoryPieChart();

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

  const familyNameInput = $("familyName").value.trim();
  const result = $("familyResult");

  try {
    const data = await api("/families", {
      method: "POST",
      body: JSON.stringify({
        name: familyNameInput
      })
    });

    if (!data || !data.entry_code) {
      throw new Error("Family was created, but no family code was returned. Please try again.");
    }

    const familyName = data.family_name || familyNameInput || "Family";
    const entryCode = data.entry_code;

    result.classList.remove("hidden");
    result.innerHTML = `
      <strong>${escapeHTML(familyName)}</strong> created.<br />
      Share this family code:
      <strong style="letter-spacing: 2px; font-size: 1.15em; color: var(--color-primary, #1e3a2f);">${escapeHTML(entryCode)}</strong><br />
      <small style="color: var(--color-subtext, #555);">Use this code in "Join a family" above.</small>
    `;

    // Auto-fill into Join form and Sign-in form for convenience
    if ($("joinFamilyCode")) $("joinFamilyCode").value = entryCode;
    if ($("loginFamilyCode")) $("loginFamilyCode").value = entryCode;

    $("familyForm").reset();

    showToast("Family created! Code: " + entryCode, "success");
  } catch (error) {
    if (result) {
      result.classList.remove("hidden");
      result.innerHTML = `<span style="color: #b91c1c; font-weight: 500;">⚠️ Error: ${escapeHTML(error.message)}</span>`;
    }
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
$("logoutBtn").onclick = async () => {
  try {
    if (token) {
      await fetch(API + "/families/logout", {
        method: "POST",
        headers: headers()
      }).catch(() => { });
    }
  } finally {
    localStorage.removeItem("session_token");
    localStorage.removeItem("user");
    token = null;
    user = null;
    showAuth();
  }
};

// Category filter change event
if ($("categoryFilter")) {
  $("categoryFilter").onchange = e => {
    selectedCategory = e.target.value;
    renderExpenses();
  };
}

// Chart Month Navigation events
if ($("prevMonthBtn")) {
  $("prevMonthBtn").onclick = prevMonth;
}
if ($("nextMonthBtn")) {
  $("nextMonthBtn").onclick = nextMonth;
}
if ($("chartMonthSelect")) {
  $("chartMonthSelect").onchange = e => onChartMonthSelect(e.target.value);
}

// Initial screen
if (token && user) {
  showDashboard();
} else {
  showAuth();
}

// Global functions for inline HTML buttons and testing
window.getMainCategory = getMainCategory;
window.matchesCategoryFilter = matchesCategoryFilter;
window.updateCategoryFilter = updateCategoryFilter;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.onChartMonthSelect = onChartMonthSelect;
window.openEdit = openEdit;
window.deleteExpense = deleteExpense;

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { });
  });
}
