// ── STATE ──────────────────────────────────────────────────────
const state = {
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  currentPage: 'dashboard',
  charts: {}
};

const MONTHS = ['','January','February','March','April','May','June',
  'July','August','September','October','November','December'];

// ── UTILS ──────────────────────────────────────────────────────
const fmt = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtNum = n => Number(n || 0).toLocaleString('en-IN');
const fmtShort = n => { const v = Number(n || 0); return Math.abs(v) >= 1000 ? '₹' + (v/1000).toFixed(1) + 'k' : '₹' + v.toFixed(0); };
const daysInMonth = (m, y) => new Date(y, m, 0).getDate();
const weekday = (y, m, d) => ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(y, m-1, d).getDay()];
const periodLabel = () => `${MONTHS[state.month]} ${state.year}`;

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  el.className = `toast align-items-center text-white border-0 bg-${type}`;
  new bootstrap.Toast(el, { delay: 2500 }).show();
}

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
}

// ── NAVIGATION ─────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(el.dataset.page);
  });
});

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  document.querySelectorAll('.page').forEach(el =>
    el.classList.toggle('active', el.id === `page-${page}`));
  document.getElementById('pageTitle').textContent =
    { dashboard:'Dashboard', entry:'Data Entry', staff:'Staff',
      expenses:'Expenses', analysis:'Analysis', yearly:'Yearly View' }[page];
  loadPage(page);
}

function loadPage(page) {
  switch(page) {
    case 'dashboard': loadDashboard(); break;
    case 'entry':     loadEntry(); break;
    case 'staff':     loadStaff(); break;
    case 'expenses':  loadExpenses(); break;
    case 'analysis':  loadAnalysis(); break;
    case 'yearly':    loadYearly(); break;
  }
}

// ── MONTH/YEAR SELECTOR ────────────────────────────────────────
document.getElementById('monthSelect').value = state.month;
document.getElementById('yearInput').value = state.year;

document.getElementById('monthSelect').addEventListener('change', function() {
  state.month = parseInt(this.value);
  updateLabels();
  loadPage(state.currentPage);
});
document.getElementById('yearInput').addEventListener('change', function() {
  state.year = parseInt(this.value);
  updateLabels();
  loadPage(state.currentPage);
});

function updateLabels() {
  const label = periodLabel();
  document.getElementById('currentPeriodLabel').textContent = label;
  document.querySelectorAll('[id$="-month-label"], [id$="-month-label2"]').forEach(el => el.textContent = label);
  document.getElementById('yearly-year-label').textContent = state.year;
  document.getElementById('exp-month-label').textContent = label;
}

// Sidebar toggle
document.getElementById('sidebarToggle').addEventListener('click', () => {
  const sb = document.getElementById('sidebar');
  const mc = document.getElementById('mainContent');
  if (window.innerWidth <= 768) {
    sb.classList.toggle('open');
  } else {
    sb.classList.toggle('collapsed');
    mc.classList.toggle('expanded');
  }
});

// ── DASHBOARD ──────────────────────────────────────────────────
async function loadDashboard() {
  const data = await api(`/api/analysis/${state.year}/${state.month}`);

  document.getElementById('dash-revenue').textContent = fmt(data.totalRevenue);
  document.getElementById('dash-quantity').textContent = fmtNum(data.totalQuantity);
  document.getElementById('dash-expenses').textContent = fmt(data.totalExpenses);
  document.getElementById('dash-profit').textContent = fmt(data.profit);
  document.getElementById('dash-avg').textContent = fmt(data.avgDailyRevenue);
  document.getElementById('dash-staff').textContent = fmt(data.totalStaffCost);
  document.getElementById('dash-other-exp').textContent = fmt(data.totalOtherExpenses);
  document.getElementById('dash-month-label').textContent = periodLabel();

  const margin = data.totalRevenue > 0 ? ((data.profit / data.totalRevenue) * 100).toFixed(1) : 0;
  document.getElementById('dash-margin').textContent = margin + '%';

  const profitCard = document.getElementById('profitCard');
  profitCard.className = 'stat-card ' + (data.profit >= 0 ? 'profit' : 'expenses');

  // Line chart
  const days = Array.from({ length: daysInMonth(state.month, state.year) }, (_, i) => i + 1);
  const revenueMap = {};
  data.dailyData.forEach(d => { revenueMap[parseInt(d.date.split('-')[2])] = d.revenue; });
  const revenues = days.map(d => revenueMap[d] || 0);

  destroyChart('dashRevenue');
  state.charts.dashRevenue = new Chart(document.getElementById('dashRevenueChart'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        label: 'Revenue',
        data: revenues,
        backgroundColor: 'rgba(79,110,247,0.7)',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: v => '₹' + (v/1000).toFixed(0) + 'k' } }
      }
    }
  });

  // Pie chart
  destroyChart('dashPie');
  state.charts.dashPie = new Chart(document.getElementById('dashPieChart'), {
    type: 'doughnut',
    data: {
      labels: ['Revenue', 'Staff Cost', 'Other Expenses'],
      datasets: [{
        data: [data.totalRevenue, data.totalStaffCost, data.totalOtherExpenses],
        backgroundColor: ['#22c55e', '#ef4444', '#f97316'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

// ── DATA ENTRY ─────────────────────────────────────────────────
async function loadEntry() {
  document.getElementById('entry-month-label').textContent = periodLabel();

  const [existing, staff, expenses] = await Promise.all([
    api(`/api/daily/${state.year}/${state.month}`),
    api('/api/staff'),
    api(`/api/expenses/${state.year}/${state.month}`)
  ]);

  const dataMap = {};
  existing.forEach(d => { dataMap[d.date] = d; });

  const days = daysInMonth(state.month, state.year);
  const dayNums = Array.from({ length: days }, (_, i) => i + 1);
  const dateFor = d => `${state.year}-${String(state.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const isWE = d => { const w = weekday(state.year, state.month, d); return w === 'Saturday' || w === 'Sunday'; };

  const staffTotal = staff.reduce((s, m) => s + m.monthly_salary, 0);
  const expTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const staffDaily = staffTotal / days;
  const expDaily = expTotal / days;

  // ── HEADER ────────────────────────────────────────────────────
  const thead = document.getElementById('sheetHead');
  let h = '<tr class="row-dates">';
  h += '<th class="col-sticky col-name">Category</th>';
  h += '<th class="col-sticky col-monthly">Monthly</th>';
  dayNums.forEach(d => h += `<th class="col-day${isWE(d) ? ' weekend' : ''}">${d}</th>`);
  h += '<th class="col-total">Total</th></tr>';

  h += '<tr class="row-weekdays">';
  h += '<th class="col-sticky col-name"></th>';
  h += '<th class="col-sticky col-monthly"></th>';
  dayNums.forEach(d => h += `<th class="col-day${isWE(d) ? ' weekend' : ''}">${weekday(state.year, state.month, d).slice(0,3)}</th>`);
  h += '<th></th></tr>';
  thead.innerHTML = h;

  // ── BODY ──────────────────────────────────────────────────────
  const tbody = document.getElementById('sheetBody');
  let b = '';

  const blankRow = `<tr class="row-blank"><td class="col-sticky col-name"></td><td class="col-sticky col-monthly"></td>${'<td></td>'.repeat(days)}<td></td></tr>`;
  const sectionHeader = label =>
    `<tr class="row-section-header"><td class="col-sticky col-name" colspan="2">${label}</td>${'<td class="col-day"></td>'.repeat(days)}<td class="col-total"></td></tr>`;

  // Revenue row
  b += '<tr class="row-revenue">';
  b += '<td class="col-sticky col-name fw-bold">Total Revenue</td><td class="col-sticky col-monthly"></td>';
  dayNums.forEach(d => {
    const date = dateFor(d);
    const val = dataMap[date]?.revenue || '';
    b += `<td class="col-day${isWE(d) ? ' weekend' : ''}"><input type="number" class="sheet-input rev-input" data-date="${date}" value="${val}" min="0" step="1" placeholder="0"/></td>`;
  });
  b += '<td class="col-total fw-bold" id="sheet-rev-total">₹0</td></tr>';

  // Quantity row
  b += '<tr class="row-quantity">';
  b += '<td class="col-sticky col-name fw-bold">Total Quantity</td><td class="col-sticky col-monthly"></td>';
  dayNums.forEach(d => {
    const date = dateFor(d);
    const val = dataMap[date]?.quantity || '';
    b += `<td class="col-day${isWE(d) ? ' weekend' : ''}"><input type="number" class="sheet-input qty-input" data-date="${date}" value="${val}" min="0" step="1" placeholder="0"/></td>`;
  });
  b += '<td class="col-total fw-bold" id="sheet-qty-total">0</td></tr>';

  b += blankRow;

  // Staff section
  b += sectionHeader('Fixed Staff Expenses');
  staff.forEach(s => {
    const daily = s.monthly_salary / days;
    b += '<tr class="row-staff">';
    b += `<td class="col-sticky col-name">${s.name}</td>`;
    b += `<td class="col-sticky col-monthly">${fmt(s.monthly_salary)}</td>`;
    dayNums.forEach(d => b += `<td class="col-day cell-calc${isWE(d) ? ' weekend' : ''}">${fmtShort(daily)}</td>`);
    b += `<td class="col-total">${fmt(s.monthly_salary)}</td></tr>`;
  });
  // Staff totals
  b += '<tr class="row-section-total">';
  b += `<td class="col-sticky col-name">Staff Total</td><td class="col-sticky col-monthly">${fmt(staffTotal)}</td>`;
  dayNums.forEach(d => b += `<td class="col-day cell-calc fw-bold${isWE(d) ? ' weekend' : ''}">${fmtShort(staffDaily)}</td>`);
  b += `<td class="col-total fw-bold">${fmt(staffTotal)}</td></tr>`;

  b += blankRow;

  // Expenses section
  b += sectionHeader('Operating Expenses');
  expenses.forEach(e => {
    const daily = e.amount / days;
    b += '<tr class="row-expense">';
    b += `<td class="col-sticky col-name">${e.category}</td>`;
    b += `<td class="col-sticky col-monthly">${fmt(e.amount)}</td>`;
    dayNums.forEach(d => b += `<td class="col-day cell-calc${isWE(d) ? ' weekend' : ''}">${fmtShort(daily)}</td>`);
    b += `<td class="col-total">${fmt(e.amount)}</td></tr>`;
  });
  // Expenses totals
  b += '<tr class="row-section-total">';
  b += `<td class="col-sticky col-name">Expenses Total</td><td class="col-sticky col-monthly">${fmt(expTotal)}</td>`;
  dayNums.forEach(d => b += `<td class="col-day cell-calc fw-bold${isWE(d) ? ' weekend' : ''}">${fmtShort(expDaily)}</td>`);
  b += `<td class="col-total fw-bold">${fmt(expTotal)}</td></tr>`;

  b += blankRow;

  // Profit row
  b += '<tr class="row-profit">';
  b += '<td class="col-sticky col-name fw-bold">Profit / Loss</td><td class="col-sticky col-monthly"></td>';
  dayNums.forEach(d => {
    const rev = dataMap[dateFor(d)]?.revenue || 0;
    const p = rev - staffDaily - expDaily;
    b += `<td class="col-day cell-profit${isWE(d) ? ' weekend' : ''} ${p >= 0 ? 'positive' : 'negative'}" data-day="${d}">${fmtShort(p)}</td>`;
  });
  b += '<td class="col-total fw-bold" id="sheet-profit-total">₹0</td></tr>';

  tbody.innerHTML = b;

  updateSheetTotals(days, staffDaily, expDaily);

  tbody.querySelectorAll('.rev-input, .qty-input').forEach(inp =>
    inp.addEventListener('input', () => updateSheetTotals(days, staffDaily, expDaily))
  );

  document.getElementById('saveAllBtn').onclick = saveAll;
}

function updateSheetTotals(days, staffDaily, expDaily) {
  let rev = 0, qty = 0;
  document.querySelectorAll('.rev-input').forEach(i => rev += parseFloat(i.value) || 0);
  document.querySelectorAll('.qty-input').forEach(i => qty += parseFloat(i.value) || 0);

  const revEl = document.getElementById('sheet-rev-total');
  const qtyEl = document.getElementById('sheet-qty-total');
  if (revEl) revEl.textContent = fmt(rev);
  if (qtyEl) qtyEl.textContent = fmtNum(qty);

  document.querySelectorAll('.rev-input').forEach(inp => {
    const day = parseInt(inp.dataset.date.split('-')[2]);
    const p = (parseFloat(inp.value) || 0) - staffDaily - expDaily;
    const cell = document.querySelector(`.cell-profit[data-day="${day}"]`);
    if (cell) {
      cell.textContent = fmtShort(p);
      cell.classList.toggle('positive', p >= 0);
      cell.classList.toggle('negative', p < 0);
    }
  });

  const totalProfit = rev - (staffDaily * days) - (expDaily * days);
  const profitTotalEl = document.getElementById('sheet-profit-total');
  if (profitTotalEl) {
    profitTotalEl.textContent = fmt(totalProfit);
    profitTotalEl.className = `col-total fw-bold ${totalProfit >= 0 ? 'text-profit' : 'text-loss'}`;
  }
}

async function saveAll() {
  const revInputs = document.querySelectorAll('.rev-input');
  for (const inp of revInputs) {
    const date = inp.dataset.date;
    const rev = parseFloat(inp.value) || 0;
    const qtyInp = document.querySelector(`.qty-input[data-date="${date}"]`);
    const qty = parseFloat(qtyInp?.value) || 0;
    if (rev > 0 || qty > 0) {
      await api('/api/daily', 'POST', { date, revenue: rev, quantity: qty });
    }
  }
  showToast('All data saved!');
}

// ── STAFF ──────────────────────────────────────────────────────
async function loadStaff() {
  const staff = await api('/api/staff');
  const tbody = document.getElementById('staffBody');
  tbody.innerHTML = '';
  let total = 0;

  staff.forEach(s => {
    total += s.monthly_salary;
    const dailyRate = (s.monthly_salary / 30).toFixed(0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${s.name}</strong></td>
      <td>${fmt(s.monthly_salary)}</td>
      <td class="text-muted">${fmt(dailyRate)}/day</td>
      <td>
        <button class="btn btn-sm btn-outline-secondary me-1" onclick="editStaff(${s.id},'${s.name}',${s.monthly_salary})">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteStaff(${s.id})">
          <i class="bi bi-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('totalStaffCost').textContent = fmt(total);
  document.getElementById('staffCount').textContent = `${staff.length} staff member${staff.length !== 1 ? 's' : ''}`;
}

document.getElementById('saveStaffBtn').addEventListener('click', async () => {
  const id = document.getElementById('staffId').value;
  const name = document.getElementById('staffName').value.trim();
  const salary = parseFloat(document.getElementById('staffSalary').value);
  if (!name || isNaN(salary)) return showToast('Please fill in name and salary', 'danger');

  if (id) {
    await api(`/api/staff/${id}`, 'PUT', { name, monthly_salary: salary });
    showToast('Staff updated!');
  } else {
    await api('/api/staff', 'POST', { name, monthly_salary: salary });
    showToast('Staff added!');
  }
  clearStaffForm();
  loadStaff();
});

document.getElementById('clearStaffBtn').addEventListener('click', clearStaffForm);

function clearStaffForm() {
  document.getElementById('staffId').value = '';
  document.getElementById('staffName').value = '';
  document.getElementById('staffSalary').value = '';
  document.getElementById('saveStaffBtn').innerHTML = '<i class="bi bi-person-plus"></i> Save Staff';
}

function editStaff(id, name, salary) {
  document.getElementById('staffId').value = id;
  document.getElementById('staffName').value = name;
  document.getElementById('staffSalary').value = salary;
  document.getElementById('saveStaffBtn').innerHTML = '<i class="bi bi-pencil"></i> Update Staff';
}

async function deleteStaff(id) {
  if (!confirm('Remove this staff member?')) return;
  await api(`/api/staff/${id}`, 'DELETE');
  showToast('Staff removed');
  loadStaff();
}

// ── EXPENSES ───────────────────────────────────────────────────
async function loadExpenses() {
  const label = periodLabel();
  document.getElementById('exp-month-label').textContent = label;
  document.getElementById('exp-month-label2').textContent = label;

  const expenses = await api(`/api/expenses/${state.year}/${state.month}`);
  const tbody = document.getElementById('expBody');
  tbody.innerHTML = '';
  let total = 0;

  expenses.forEach(e => {
    total += e.amount;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.category}</td>
      <td>${fmt(e.amount)}</td>
      <td>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteExpense('${e.category}')">
          <i class="bi bi-trash"></i>
        </button>
      </td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('totalOtherExp').textContent = fmt(total);
}

document.getElementById('saveExpBtn').addEventListener('click', async () => {
  const category = document.getElementById('expCategory').value.trim();
  const amount = parseFloat(document.getElementById('expAmount').value);
  if (!category || isNaN(amount)) return showToast('Fill in category and amount', 'danger');

  await api('/api/expenses', 'POST', { year: state.year, month: state.month, category, amount });
  document.getElementById('expCategory').value = '';
  document.getElementById('expAmount').value = '';
  showToast('Expense saved!');
  loadExpenses();
});

async function deleteExpense(category) {
  await api(`/api/expenses/${state.year}/${state.month}/${encodeURIComponent(category)}`, 'DELETE');
  showToast('Expense removed');
  loadExpenses();
}

// ── ANALYSIS ───────────────────────────────────────────────────
async function loadAnalysis() {
  document.getElementById('analysis-month-label').textContent = periodLabel();
  const data = await api(`/api/analysis/${state.year}/${state.month}`);

  // P&L Summary
  const margin = data.totalRevenue > 0 ? ((data.profit / data.totalRevenue) * 100).toFixed(1) : 0;
  const isProfit = data.profit >= 0;
  document.getElementById('analysisSummary').innerHTML = `
    <div class="pnl-row"><span>Total Revenue</span><span class="text-profit fw-bold">${fmt(data.totalRevenue)}</span></div>
    <div class="pnl-row"><span>Staff Cost</span><span class="text-danger">${fmt(data.totalStaffCost)}</span></div>
    <div class="pnl-row"><span>Other Expenses</span><span class="text-danger">${fmt(data.totalOtherExpenses)}</span></div>
    <div class="pnl-row"><span>Total Expenses</span><span class="text-danger">${fmt(data.totalExpenses)}</span></div>
    <div class="pnl-row total"><span>Net ${isProfit ? 'Profit' : 'Loss'}</span>
      <span class="${isProfit ? 'text-profit' : 'text-loss'}">${fmt(data.profit)}</span></div>
    <div class="pnl-row"><span>Profit Margin</span><span class="${isProfit ? 'text-profit' : 'text-loss'}">${margin}%</span></div>
    <div class="pnl-row"><span>Total Quantity Sold</span><span class="text-primary fw-bold">${fmtNum(data.totalQuantity)}</span></div>
    <div class="pnl-row"><span>Avg Daily Revenue</span><span>${fmt(data.avgDailyRevenue)}</span></div>`;

  // Line chart
  const days = Array.from({ length: daysInMonth(state.month, state.year) }, (_, i) => i + 1);
  const revenueMap = {};
  data.dailyData.forEach(d => { revenueMap[parseInt(d.date.split('-')[2])] = d.revenue; });
  const revenues = days.map(d => revenueMap[d] || 0);

  destroyChart('analysisLine');
  state.charts.analysisLine = new Chart(document.getElementById('analysisLineChart'), {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: 'Daily Revenue',
        data: revenues,
        borderColor: '#4f6ef7',
        backgroundColor: 'rgba(79,110,247,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: v => '₹' + (v/1000).toFixed(0) + 'k' } } }
    }
  });

  // Pie chart - expense breakdown
  const expLabels = ['Staff Cost', ...data.expenses.map(e => e.category)];
  const expValues = [data.totalStaffCost, ...data.expenses.map(e => e.amount)];
  const colors = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];

  destroyChart('analysisPie');
  state.charts.analysisPie = new Chart(document.getElementById('analysisPieChart'), {
    type: 'pie',
    data: {
      labels: expLabels,
      datasets: [{ data: expValues, backgroundColor: colors }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });

  // Staff breakdown table
  const tbody = document.getElementById('analysisStaffBody');
  tbody.innerHTML = '';
  data.staff.forEach(s => {
    const pct = data.totalRevenue > 0 ? ((s.monthly_salary / data.totalRevenue) * 100).toFixed(1) : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.name}</td><td>${fmt(s.monthly_salary)}</td>
      <td><span class="badge ${pct > 20 ? 'bg-danger' : 'bg-success'}">${pct}%</span></td>`;
    tbody.appendChild(tr);
  });
}

// ── YEARLY VIEW ────────────────────────────────────────────────
async function loadYearly() {
  document.getElementById('yearly-year-label').textContent = state.year;
  const months = await api(`/api/yearly/${state.year}`);

  const tbody = document.getElementById('yearlyBody');
  tbody.innerHTML = '';
  let totRev = 0, totStaff = 0, totOther = 0, totProfit = 0;

  months.forEach(m => {
    const isProfit = m.profit >= 0;
    totRev += m.revenue; totStaff += m.staffCost;
    totOther += m.otherExpenses; totProfit += m.profit;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${MONTHS[m.month]}</strong></td>
      <td class="text-success fw-bold">${fmt(m.revenue)}</td>
      <td class="text-danger">${fmt(m.staffCost)}</td>
      <td class="text-warning">${fmt(m.otherExpenses)}</td>
      <td class="text-danger">${fmt(m.staffCost + m.otherExpenses)}</td>
      <td class="${isProfit ? 'text-profit' : 'text-loss'} fw-bold">${fmt(m.profit)}</td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('yearlyTotals').innerHTML = `
    <td>TOTAL</td>
    <td class="text-success">${fmt(totRev)}</td>
    <td class="text-danger">${fmt(totStaff)}</td>
    <td class="text-warning">${fmt(totOther)}</td>
    <td class="text-danger">${fmt(totStaff + totOther)}</td>
    <td class="${totProfit >= 0 ? 'text-profit' : 'text-loss'}">${fmt(totProfit)}</td>`;

  destroyChart('yearly');
  state.charts.yearly = new Chart(document.getElementById('yearlyChart'), {
    type: 'bar',
    data: {
      labels: months.map(m => MONTHS[m.month].slice(0, 3)),
      datasets: [
        { label: 'Revenue', data: months.map(m => m.revenue), backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 4 },
        { label: 'Expenses', data: months.map(m => m.staffCost + m.otherExpenses), backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 4 },
        { label: 'Profit', data: months.map(m => m.profit), backgroundColor: 'rgba(79,110,247,0.7)', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      scales: { y: { ticks: { callback: v => '₹' + (v/1000).toFixed(0) + 'k' } } }
    }
  });
}

// ── INIT ───────────────────────────────────────────────────────
updateLabels();
loadDashboard();
