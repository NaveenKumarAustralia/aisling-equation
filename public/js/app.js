// ── STATE ──────────────────────────────────────────────────────
const state = {
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  currentPage: 'dashboard',
  entryView: 'month',
  charts: {},
  sheetSelection: { anchor: null, cells: new Set() },
  entryEditMode: false,
  dashEditMode: false
};

const DEFAULT_DASH_LAYOUT = {
  cols: 4,
  size: 'md',
  colors: {
    revenue: '#22c55e',
    quantity: '#3b82f6',
    expenses: '#ef4444',
    profit: '#8b5cf6'
  }
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

const toHex = n => n.toString(16).padStart(2, '0');
function tintColor(hex, ratio = 0.86) {
  const raw = (hex || '#4f6ef7').replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map(x => x + x).join('') : raw.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const mix = c => Math.round(c + (255 - c) * ratio);
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

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
      expenses:'Expenses', analysis:'Analysis', yearly:'Yearly View',
      shipments:'Shipments', balance:'Balance' }[page];
  loadPage(page);
}

function loadPage(page) {
  switch(page) {
    case 'dashboard': loadDashboard(); break;
    case 'entry':     initEntryPage(); break;
    case 'staff':     loadStaff(); break;
    case 'expenses':  loadExpenses(); break;
    case 'analysis':  loadAnalysis(); break;
    case 'yearly':    loadYearly(); break;
    case 'shipments': loadShipments(); break;
    case 'balance':   loadBalance(); break;
  }
}

function initEntryPage() {
  buildSheetTabs();
  document.getElementById('yearDisplay').textContent = state.year;
  initEntryEditButton();
  applyEntryEditMode();

  document.getElementById('yearPrev').onclick = () => {
    state.year--;
    document.getElementById('yearInput').value = state.year;
    updateLabels();
    buildSheetTabs();
    state.entryView === 'total' ? loadYearlyInEntry() : loadEntry();
  };
  document.getElementById('yearNext').onclick = () => {
    state.year++;
    document.getElementById('yearInput').value = state.year;
    updateLabels();
    buildSheetTabs();
    state.entryView === 'total' ? loadYearlyInEntry() : loadEntry();
  };

  if (state.entryView === 'total') loadYearlyInEntry();
  else loadEntry();
}

function initEntryEditButton() {
  const btn = document.getElementById('entryEditBtn');
  if (!btn || btn._init) return;
  btn._init = true;
  btn.addEventListener('click', () => {
    state.entryEditMode = !state.entryEditMode;
    applyEntryEditMode();
  });
}

function applyEntryEditMode() {
  const container = document.querySelector('#page-entry .sheet-container');
  const btn = document.getElementById('entryEditBtn');
  if (container) container.classList.toggle('entry-locked', !state.entryEditMode);
  if (btn) {
    btn.className = state.entryEditMode ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline-secondary';
    btn.innerHTML = state.entryEditMode
      ? '<i class="bi bi-check2-square"></i> Done'
      : '<i class="bi bi-pencil-square"></i> Edit';
  }
}

function buildSheetTabs() {
  const tabNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const container = document.getElementById('sheetTabs');
  const isTotal = state.entryView === 'total';

  const yr = `'${String(state.year).slice(2)}`;
  container.innerHTML = tabNames.map((name, i) =>
    `<div class="sheet-tab${!isTotal && state.month === i+1 ? ' active' : ''}" data-month="${i+1}">${name} ${yr}</div>`
  ).join('') +
  `<div class="sheet-tab total-tab${isTotal ? ' active' : ''}" data-month="total">${state.year} Monthly Totals</div>`;

  document.getElementById('yearDisplay').textContent = state.year;

  container.querySelectorAll('.sheet-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      if (tab.dataset.month === 'total') {
        state.entryView = 'total';
        document.getElementById('saveAllBtn').style.display = 'none';
        document.getElementById('sheetScroll').style.display = 'none';
        document.getElementById('yearlyInEntry').style.display = '';
        loadYearlyInEntry();
      } else {
        state.entryView = 'month';
        state.month = parseInt(tab.dataset.month);
        document.getElementById('monthSelect').value = state.month;
        updateLabels();
        document.getElementById('saveAllBtn').style.display = '';
        document.getElementById('sheetScroll').style.display = '';
        document.getElementById('yearlyInEntry').style.display = 'none';
        loadEntry();
      }
    });
  });
}

async function loadYearlyInEntry() {
  const container = document.getElementById('yearlyInEntry');
  container.innerHTML = '<p class="text-muted">Loading…</p>';
  const months = await api(`/api/yearly/${state.year}`);
  let totRev = 0, totStaff = 0, totOther = 0, totProfit = 0;

  const rows = months.map(m => {
    totRev += m.revenue; totStaff += m.staffCost;
    totOther += m.otherExpenses; totProfit += m.profit;
    const p = m.profit >= 0;
    return `<tr class="${m.revenue > 0 ? '' : 'text-muted'}">
      <td><strong>${MONTHS[m.month].slice(0,3)}</strong></td>
      <td class="text-end text-success fw-bold">${fmt(m.revenue)}</td>
      <td class="text-end text-danger">${fmt(m.staffCost)}</td>
      <td class="text-end" style="color:#b45309">${fmt(m.otherExpenses)}</td>
      <td class="text-end text-danger">${fmt(m.staffCost + m.otherExpenses)}</td>
      <td class="text-end ${p ? 'text-profit' : 'text-loss'} fw-bold">${fmt(m.profit)}</td>
    </tr>`;
  }).join('');

  const tp = totProfit >= 0;
  container.innerHTML = `
    <table class="table table-hover mb-0" style="font-size:14px">
      <thead class="table-dark">
        <tr>
          <th>Month</th>
          <th class="text-end">Revenue</th>
          <th class="text-end">Staff Cost</th>
          <th class="text-end">Other Exp</th>
          <th class="text-end">Total Exp</th>
          <th class="text-end">Profit / Loss</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="table-dark fw-bold">
          <td>TOTAL ${state.year}</td>
          <td class="text-end text-success">${fmt(totRev)}</td>
          <td class="text-end text-danger">${fmt(totStaff)}</td>
          <td class="text-end" style="color:#fbbf24">${fmt(totOther)}</td>
          <td class="text-end text-danger">${fmt(totStaff + totOther)}</td>
          <td class="text-end ${tp ? 'text-profit' : 'text-loss'}">${fmt(totProfit)}</td>
        </tr>
      </tfoot>
    </table>`;
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

const DASH_METRICS = {
  revenue:   { label: 'Total Revenue',     icon: 'bi-cash-stack',     card: 'revenue',  lower: false, fmt: fmt,    val: d => d.totalRevenue },
  quantity:  { label: 'Total Quantity',    icon: 'bi-box-seam',       card: 'quantity', lower: false, fmt: fmtNum, val: d => d.totalQuantity },
  expenses:  { label: 'Total Expenses',    icon: 'bi-receipt',        card: 'expenses', lower: true,  fmt: fmt,    val: d => d.totalExpenses },
  profit:    { label: 'Net Profit',        icon: 'bi-graph-up-arrow', card: 'profit',   lower: false, fmt: fmt,    val: d => d.profit },
  avgRev:    { label: 'Avg Daily Revenue', icon: 'bi-calendar3',      card: 'quantity', lower: false, fmt: fmt,    val: d => d.avgDailyRevenue },
  unitCost:  { label: 'Avg Cost / Item',   icon: 'bi-tag',            card: 'expenses', lower: true,  fmt: fmt,    val: d => d.totalQuantity > 0 ? d.totalExpenses / d.totalQuantity : 0 },
  staffCost: { label: 'Staff Cost',        icon: 'bi-people',         card: 'expenses', lower: true,  fmt: fmt,    val: d => d.totalStaffCost },
  otherExp:  { label: 'Other Expenses',    icon: 'bi-folder2-open',   card: 'expenses', lower: true,  fmt: fmt,    val: d => d.totalOtherExpenses },
  margin:    { label: 'Profit Margin',     icon: 'bi-percent',        card: 'profit',   lower: false, fmt: n => Number(n||0).toFixed(1)+'%', val: d => d.totalRevenue > 0 ? (d.profit/d.totalRevenue)*100 : 0 },
};

function prevMo(y, m) { return m === 1 ? {year:y-1,month:12} : {year:y,month:m-1}; }
function nextMo(y, m) { return m === 12 ? {year:y+1,month:1} : {year:y,month:m+1}; }

function computeRangeMonths() {
  // Presets anchor to currently selected month/year in sidebar.
  const ty = state.year;
  const tm = state.month;
  if (state.dashRange === 'thisMonth')  return [{year:ty, month:tm}];
  if (state.dashRange === 'lastMonth')  { return [prevMo(ty,tm)]; }
  if (['3m','6m','12m'].includes(state.dashRange)) {
    const n = state.dashRange === '3m' ? 3 : state.dashRange === '6m' ? 6 : 12;
    const list = []; let cur = {year:ty,month:tm};
    for (let i = 0; i < n; i++) { list.unshift({...cur}); cur = prevMo(cur.year,cur.month); }
    return list;
  }
  if (state.dashRange === 'custom' && state.dashFrom && state.dashTo) {
    const list = []; let cur = {...state.dashFrom};
    while (cur.year < state.dashTo.year || (cur.year === state.dashTo.year && cur.month <= state.dashTo.month)) {
      list.push({...cur}); cur = nextMo(cur.year,cur.month);
      if (list.length > 24) break;
    }
    return list.length ? list : [{year:ty,month:tm}];
  }
  return [{year:ty,month:tm}];
}

function dashRangeLabel(months) {
  if (!months.length) return '';
  const f = months[0], l = months[months.length-1];
  const fmtDay = (d, m, y) => `${String(d).padStart(2, '0')} ${MONTHS[m].slice(0,3)} ${y}`;
  const from = fmtDay(1, f.month, f.year);
  const to = fmtDay(daysInMonth(l.month, l.year), l.month, l.year);
  if (state.dashRange === 'thisMonth')  return `${from} – ${to}`;
  if (state.dashRange === 'lastMonth')  return `${from} – ${to}`;
  if (state.dashRange === '3m')  return `Last 3 Months (${from} – ${to})`;
  if (state.dashRange === '6m')  return `Last 6 Months (${from} – ${to})`;
  if (state.dashRange === '12m') return `Last 12 Months (${from} – ${to})`;
  if (state.dashRange === 'custom') return `${from} – ${to}`;
  return `${from} – ${to}`;
}

async function fetchAggData(months) {
  const results = await Promise.all(months.map(({year,month}) => api(`/api/analysis/${year}/${month}`)));
  const totalRevenue      = results.reduce((s,r) => s+(r.totalRevenue||0), 0);
  const totalQuantity     = results.reduce((s,r) => s+(r.totalQuantity||0), 0);
  const totalStaffCost    = results.reduce((s,r) => s+(r.totalStaffCost||0), 0);
  const totalOtherExpenses= results.reduce((s,r) => s+(r.totalOtherExpenses||0), 0);
  const totalExpenses     = totalStaffCost + totalOtherExpenses;
  const allDaily          = results.flatMap(r => r.dailyData||[]);
  const activeDays        = allDaily.filter(d => d.revenue > 0).length;
  const avgDailyRevenue   = activeDays > 0 ? totalRevenue/activeDays : 0;

  // Profit formula aligned with Data Entry row:
  // per day: revenue - (revenue * 0.8) - dailyTotal
  // where dailyTotal = (monthStaff + monthOtherExpenses) / daysInMonth
  const profit = results.reduce((sum, r, idx) => {
    const ym = months[idx] || {};
    const dim = daysInMonth(ym.month || 1, ym.year || new Date().getFullYear());
    const monthDailyTotal = ((r.totalStaffCost || 0) + (r.totalOtherExpenses || 0)) / dim;
    const monthProfit = (r.dailyData || []).reduce((acc, day) => {
      const rev = Number(day?.revenue || 0);
      return acc + (rev - (rev * 0.8) - monthDailyTotal);
    }, 0);
    return sum + monthProfit;
  }, 0);

  return { totalRevenue, totalQuantity, totalStaffCost, totalOtherExpenses, totalExpenses, profit, avgDailyRevenue, dailyData: allDaily, results };
}

async function loadDashboard() {
  if (!state.dashRange) {
    state.dashRange   = 'thisMonth';
    state.dashCompare = true;
    state.tileMetrics = JSON.parse(localStorage.getItem('aislingTiles') || '["revenue","quantity","expenses","profit"]');
    state.dashLayout  = { ...DEFAULT_DASH_LAYOUT, ...(JSON.parse(localStorage.getItem('aislingDashLayout') || '{}')) };
    state.dashLayout.colors = { ...DEFAULT_DASH_LAYOUT.colors, ...(state.dashLayout.colors || {}) };
    state.dashLayout.spans = Array.isArray(state.dashLayout.spans) ? state.dashLayout.spans : [];
  }
  initDashBar();
  syncDashSettingsUI();
  const fromInp = document.getElementById('rangeFrom');
  const toInp = document.getElementById('rangeTo');
  const pad = n => String(n).padStart(2, '0');
  if (state.dashRange !== 'custom') {
    if (fromInp) fromInp.value = `${state.year}-${pad(state.month)}`;
    if (toInp) toInp.value = `${state.year}-${pad(state.month)}`;
  }

  const months = computeRangeMonths();
  document.getElementById('currentPeriodLabel').textContent = dashRangeLabel(months);

  const cmpMonths = months.map(({year,month}) => ({year:year-1,month}));
  const [data, cmpData] = await Promise.all([
    fetchAggData(months),
    state.dashCompare ? fetchAggData(cmpMonths) : Promise.resolve(null)
  ]);
  state._lastDashData = data;
  state._lastDashCmpData = cmpData;

  renderDashTiles(data, cmpData);
  destroyChart('dashRevenue');
  destroyChart('dashPie');
}

function initDashBar() {
  const presets = document.getElementById('rangePresets');
  if (!presets || presets._init) return;
  presets._init = true;

  presets.querySelectorAll('.range-btn').forEach(btn => {
    btn.onclick = () => {
      state.dashRange = btn.dataset.range;
      presets.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cr = document.getElementById('customRange');
      cr.style.setProperty('display', state.dashRange === 'custom' ? 'flex' : 'none', 'important');
      loadDashboard();
    };
  });

  document.getElementById('compareToggle').onchange = function() {
    state.dashCompare = this.checked;
    loadDashboard();
  };

  const atBtn = document.getElementById('addTileBtn');
  if (atBtn) atBtn.onclick = () => {
    if (!state.dashEditMode) return;
    addTile();
  };
  const dsBtn = document.getElementById('dashSettingsBtn');
  if (dsBtn) dsBtn.onclick = () => setDashEditMode(!state.dashEditMode);

  const fromInp = document.getElementById('rangeFrom');
  const toInp   = document.getElementById('rangeTo');
  const pad = n => String(n).padStart(2,'0');
  fromInp.value = `${state.year}-${pad(state.month)}`;
  toInp.value   = `${state.year}-${pad(state.month)}`;
  const onCustom = () => {
    const [fy,fm] = fromInp.value.split('-').map(Number);
    const [ty,tm] = toInp.value.split('-').map(Number);
    if (fy && fm && ty && tm) {
      state.dashFrom = {year:fy,month:fm};
      state.dashTo   = {year:ty,month:tm};
      loadDashboard();
    }
  };
  fromInp.onchange = onCustom;
  toInp.onchange   = onCustom;

  initDashSettingsPanel();
}

function saveDashLayout() {
  localStorage.setItem('aislingDashLayout', JSON.stringify(state.dashLayout));
}

function syncDashSettingsUI() {
  const colsSel = document.getElementById('tileColsSelect');
  const sizeSel = document.getElementById('tileSizeSelect');
  const cRev = document.getElementById('tileColorRevenue');
  const cQty = document.getElementById('tileColorQuantity');
  const cExp = document.getElementById('tileColorExpenses');
  const cPro = document.getElementById('tileColorProfit');
  if (!colsSel || !sizeSel || !cRev || !cQty || !cExp || !cPro || !state.dashLayout) return;
  colsSel.value = String(state.dashLayout.cols || DEFAULT_DASH_LAYOUT.cols);
  sizeSel.value = state.dashLayout.size || DEFAULT_DASH_LAYOUT.size;
  cRev.value = state.dashLayout.colors.revenue || DEFAULT_DASH_LAYOUT.colors.revenue;
  cQty.value = state.dashLayout.colors.quantity || DEFAULT_DASH_LAYOUT.colors.quantity;
  cExp.value = state.dashLayout.colors.expenses || DEFAULT_DASH_LAYOUT.colors.expenses;
  cPro.value = state.dashLayout.colors.profit || DEFAULT_DASH_LAYOUT.colors.profit;
}

function defaultSpanForCols(cols) {
  if (cols === 2) return 6;
  if (cols === 3) return 4;
  return 3;
}

function normalizeDashSpans() {
  const cols = Number(state.dashLayout?.cols || DEFAULT_DASH_LAYOUT.cols);
  const def = defaultSpanForCols(cols);
  if (!Array.isArray(state.dashLayout.spans)) state.dashLayout.spans = [];
  while (state.dashLayout.spans.length < state.tileMetrics.length) state.dashLayout.spans.push(def);
  if (state.dashLayout.spans.length > state.tileMetrics.length) state.dashLayout.spans.length = state.tileMetrics.length;
  state.dashLayout.spans = state.dashLayout.spans.map(v => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.max(1, Math.min(12, n)) : def;
  });
}

function setDashEditMode(on) {
  state.dashEditMode = !!on;
  const row = document.getElementById('dashTilesRow');
  const panel = document.getElementById('dashSettingsPanel');
  const btn = document.getElementById('dashSettingsBtn');
  const addBtn = document.getElementById('addTileBtn');
  if (row) row.classList.toggle('dash-edit-mode', state.dashEditMode);
  if (panel) panel.style.display = state.dashEditMode ? '' : 'none';
  if (btn) btn.innerHTML = state.dashEditMode
    ? '<i class="bi bi-check2-square"></i> Done'
    : '<i class="bi bi-sliders"></i> Edit Dashboard';
  if (addBtn) addBtn.style.display = state.dashEditMode ? '' : 'none';
  renderDashTiles(state._lastDashData, state._lastDashCmpData);
}

function initDashSettingsPanel() {
  const panel = document.getElementById('dashSettingsPanel');
  if (!panel || panel._init) return;
  panel._init = true;

  const colsSel = document.getElementById('tileColsSelect');
  const sizeSel = document.getElementById('tileSizeSelect');
  const cRev = document.getElementById('tileColorRevenue');
  const cQty = document.getElementById('tileColorQuantity');
  const cExp = document.getElementById('tileColorExpenses');
  const cPro = document.getElementById('tileColorProfit');
  const resetBtn = document.getElementById('dashSettingsReset');

  const apply = () => {
    state.dashLayout.cols = parseInt(colsSel.value) || 4;
    state.dashLayout.size = sizeSel.value || 'md';
    state.dashLayout.spans = state.tileMetrics.map(() => defaultSpanForCols(state.dashLayout.cols));
    state.dashLayout.colors.revenue = cRev.value;
    state.dashLayout.colors.quantity = cQty.value;
    state.dashLayout.colors.expenses = cExp.value;
    state.dashLayout.colors.profit = cPro.value;
    saveDashLayout();
    renderDashTiles(state._lastDashData, state._lastDashCmpData);
  };

  [colsSel, sizeSel, cRev, cQty, cExp, cPro].forEach(el => {
    el?.addEventListener('input', apply);
    el?.addEventListener('change', apply);
  });

  if (resetBtn) resetBtn.onclick = () => {
    state.dashLayout = JSON.parse(JSON.stringify(DEFAULT_DASH_LAYOUT));
    state.dashLayout.spans = state.tileMetrics.map(() => defaultSpanForCols(state.dashLayout.cols));
    saveDashLayout();
    syncDashSettingsUI();
    renderDashTiles(state._lastDashData, state._lastDashCmpData);
  };
}

function renderDashTiles(data, cmpData) {
  if (!data) return;
  const row = document.getElementById('dashTilesRow');
  if (!row) return;

  normalizeDashSpans();

  const n = state.tileMetrics.length;
  const layout = state.dashLayout || DEFAULT_DASH_LAYOUT;
  const cols = Number(layout.cols || DEFAULT_DASH_LAYOUT.cols);
  const sizeClass = layout.size === 'sm' ? 'tile-size-sm' : layout.size === 'lg' ? 'tile-size-lg' : '';
  const usedKeys = new Set(state.tileMetrics.filter(Boolean));
  const hasMore = Object.keys(DASH_METRICS).some(k => !usedKeys.has(k));
  const addBtn = document.getElementById('addTileBtn');
  if (addBtn) addBtn.style.display = (state.dashEditMode && hasMore) ? '' : 'none';

  row.classList.add('dash-grid');
  row.classList.toggle('dash-edit-mode', !!state.dashEditMode);

  row.innerHTML = state.tileMetrics.map((key, i) => {
    const m = DASH_METRICS[key]; if (!m) return '';
    const val = m.val(data);
    const colorKey = m.card === 'profit' || m.card === 'loss' ? 'profit' : m.card;
    const base = layout.colors[colorKey] || DEFAULT_DASH_LAYOUT.colors[colorKey];
    const bg = `linear-gradient(135deg, ${tintColor(base, 0.86)}, ${tintColor(base, 0.93)})`;
    const iconBg = tintColor(base, 0.72);
    const span = Math.max(1, Math.min(12, parseInt(layout.spans[i], 10) || defaultSpanForCols(cols)));
    let badge = '';
    if (cmpData && state.dashCompare) {
      const prev = m.val(cmpData);
      if (prev !== 0) {
        const pct = ((val - prev) / Math.abs(prev)) * 100;
        const good = m.lower ? pct < 0 : pct > 0;
        badge = `<span class="cmp-badge ${good ? 'cmp-good' : 'cmp-bad'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs LY</span>`;
      }
    }
    return `<div class="dash-grid-item" data-idx="${i}" style="grid-column: span ${span}">
      <div class="stat-card tile-card ${m.card} ${sizeClass}" id="tile-${i}" style="background:${bg}">
        ${n > 1 ? `<button class="tile-del-btn" onclick="removeTile(${i})">×</button>` : ''}
        <button class="tile-cfg-btn" onclick="toggleTilePanel(${i})"><i class="bi bi-gear"></i></button>
        <div class="stat-icon" style="background:${iconBg};color:${base}"><i class="bi ${m.icon}"></i></div>
        <div class="stat-label">${m.label}</div>
        <div class="stat-value" id="tileVal${i}">${m.fmt(val)}</div>
        <div class="tile-badge" id="tileBadge${i}">${badge}</div>
        <div class="tile-cfg-panel" id="tileCfgPanel${i}" style="display:none"></div>
        <div class="tile-resize-handle" data-idx="${i}"></div>
      </div>
    </div>`;
  }).join('');

  initDashboardTileInteractions(row);
}

function swapIndex(arr, from, to) {
  if (!Array.isArray(arr) || from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
  const [v] = arr.splice(from, 1);
  arr.splice(to, 0, v);
}

function initDashboardTileInteractions(row) {
  if (!row) return;
  let dragIdx = null;
  row.querySelectorAll('.dash-grid-item').forEach(item => {
    const idx = parseInt(item.dataset.idx, 10);
    item.draggable = !!state.dashEditMode;

    item.addEventListener('dragstart', e => {
      if (!state.dashEditMode) return e.preventDefault();
      dragIdx = idx;
      item.classList.add('dragging');
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      dragIdx = null;
      item.classList.remove('dragging');
      row.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    });

    item.addEventListener('dragover', e => {
      if (!state.dashEditMode) return;
      e.preventDefault();
      item.classList.add('drop-target');
    });

    item.addEventListener('dragleave', () => item.classList.remove('drop-target'));

    item.addEventListener('drop', e => {
      if (!state.dashEditMode) return;
      e.preventDefault();
      item.classList.remove('drop-target');
      const dropIdx = parseInt(item.dataset.idx, 10);
      if (!Number.isFinite(dragIdx) || dragIdx === dropIdx) return;
      swapIndex(state.tileMetrics, dragIdx, dropIdx);
      swapIndex(state.dashLayout.spans, dragIdx, dropIdx);
      saveDashLayout();
      localStorage.setItem('aislingTiles', JSON.stringify(state.tileMetrics));
      renderDashTiles(state._lastDashData, state._lastDashCmpData);
    });
  });

  row.querySelectorAll('.tile-resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      if (!state.dashEditMode) return;
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(handle.dataset.idx, 10);
      if (!Number.isFinite(idx)) return;
      const startX = e.clientX;
      const startSpan = parseInt(state.dashLayout.spans[idx], 10) || defaultSpanForCols(Number(state.dashLayout.cols || 4));
      const pxPerCol = Math.max(70, row.clientWidth / 12);

      const onMove = ev => {
        const delta = ev.clientX - startX;
        const nextSpan = Math.max(1, Math.min(12, Math.round(startSpan + (delta / pxPerCol))));
        state.dashLayout.spans[idx] = nextSpan;
        const tile = row.querySelector(`.dash-grid-item[data-idx="${idx}"]`);
        if (tile) tile.style.gridColumn = `span ${nextSpan}`;
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        saveDashLayout();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  });
}

function toggleTilePanel(idx) {
  document.querySelectorAll('.tile-cfg-panel').forEach((p, i) => {
    if (i !== idx) p.style.display = 'none';
  });
  const panel = document.getElementById(`tileCfgPanel${idx}`); if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  panel.innerHTML = Object.entries(DASH_METRICS).map(([key, m]) =>
    `<div class="tile-metric-opt${state.tileMetrics[idx]===key?' sel':''}" onclick="setTileMetric(${idx},'${key}')">${m.label}</div>`
  ).join('');
  panel.style.display = '';
}

function setTileMetric(idx, key) {
  state.tileMetrics[idx] = key;
  localStorage.setItem('aislingTiles', JSON.stringify(state.tileMetrics));
  normalizeDashSpans();
  saveDashLayout();
  const panel = document.getElementById(`tileCfgPanel${idx}`);
  if (panel) panel.style.display = 'none';
  loadDashboard();
}

function addTile() {
  const usedKeys = new Set(state.tileMetrics);
  const next = Object.keys(DASH_METRICS).find(k => !usedKeys.has(k));
  if (!next) return;
  state.tileMetrics.push(next);
  normalizeDashSpans();
  localStorage.setItem('aislingTiles', JSON.stringify(state.tileMetrics));
  saveDashLayout();
  loadDashboard();
}

function removeTile(idx) {
  if (state.tileMetrics.length <= 1) return;
  state.tileMetrics.splice(idx, 1);
  if (Array.isArray(state.dashLayout?.spans)) state.dashLayout.spans.splice(idx, 1);
  localStorage.setItem('aislingTiles', JSON.stringify(state.tileMetrics));
  saveDashLayout();
  loadDashboard();
}

document.addEventListener('click', e => {
  if (!e.target.closest('.tile-cfg-btn') && !e.target.closest('.tile-cfg-panel'))
    document.querySelectorAll('.tile-cfg-panel').forEach(p => p.style.display = 'none');
  if (state.dashEditMode && !e.target.closest('#dashSettingsBtn') && !e.target.closest('#dashSettingsPanel')) {
    const panel = document.getElementById('dashSettingsPanel');
    if (panel) panel.style.display = 'none';
  }
});

function renderDashCharts(data, months) {
  const multi = months.length > 1;
  document.getElementById('dashChartLabel').textContent = multi
    ? `Monthly Revenue — ${months[0].year === months[months.length-1].year ? months[0].year : months[0].year+'–'+months[months.length-1].year}`
    : `Daily Revenue — ${MONTHS[months[0].month]} ${months[0].year}`;

  destroyChart('dashRevenue');
  if (multi) {
    const labels = months.map(({month,year}) => MONTHS[month].slice(0,3)+(months[0].year!==months[months.length-1].year?` '${String(year).slice(2)}`:''));
    const revs   = data.results.map(r => r.totalRevenue||0);
    state.charts.dashRevenue = new Chart(document.getElementById('dashRevenueChart'), {
      type: 'bar',
      data: { labels, datasets: [{ label:'Revenue', data:revs, backgroundColor:'rgba(79,110,247,0.7)', borderRadius:4 }] },
      options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>'₹'+(v/1000).toFixed(0)+'k'}}} }
    });
  } else {
    const dayCount = daysInMonth(months[0].month, months[0].year);
    const days = Array.from({length:dayCount},(_,i)=>i+1);
    const rmap = {}; data.dailyData.forEach(d => { rmap[parseInt(d.date.split('-')[2])] = d.revenue; });
    state.charts.dashRevenue = new Chart(document.getElementById('dashRevenueChart'), {
      type: 'bar',
      data: { labels:days, datasets:[{label:'Revenue',data:days.map(d=>rmap[d]||0),backgroundColor:'rgba(79,110,247,0.7)',borderRadius:4}] },
      options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>'₹'+(v/1000).toFixed(0)+'k'}}} }
    });
  }

  destroyChart('dashPie');
  state.charts.dashPie = new Chart(document.getElementById('dashPieChart'), {
    type: 'doughnut',
    data: { labels:['Revenue','Staff Cost','Other Expenses'], datasets:[{data:[data.totalRevenue,data.totalStaffCost,data.totalOtherExpenses],backgroundColor:['#22c55e','#ef4444','#f97316'],borderWidth:2}] },
    options: { responsive:true, plugins:{legend:{position:'bottom'}} }
  });
}

// ── DATA ENTRY ─────────────────────────────────────────────────
async function loadEntry() {
  const [existing, staff, expenses] = await Promise.all([
    api(`/api/daily/${state.year}/${state.month}`),
    api('/api/staff'),
    api(`/api/expenses/${state.year}/${state.month}`)
  ]);

  // Store in state so event handlers can access
  state.dataMap = {};
  existing.forEach(d => { state.dataMap[d.date] = d; });
  state.days    = daysInMonth(state.month, state.year);
  state.dayNums = Array.from({ length: state.days }, (_, i) => i + 1);
  state.dateFor = d => `${state.year}-${String(state.month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  state.isWE    = d => { const w = weekday(state.year, state.month, d); return w === 'Saturday' || w === 'Sunday'; };

  // Header
  const thead = document.getElementById('sheetHead');
  let h = '<tr class="row-dates">';
  h += '<th class="col-sticky col-name">Category</th><th class="col-sticky col-monthly">Monthly ₹</th>';
  state.dayNums.forEach(d => h += `<th class="col-day${state.isWE(d) ? ' weekend' : ''}">${d}</th>`);
  h += '<th class="col-total">Total</th></tr>';
  h += '<tr class="row-weekdays">';
  h += '<th class="col-sticky col-name"></th><th class="col-sticky col-monthly"></th>';
  state.dayNums.forEach(d => h += `<th class="col-day${state.isWE(d) ? ' weekend' : ''}">${weekday(state.year, state.month, d).slice(0,3)}</th>`);
  h += '<th></th></tr>';
  thead.innerHTML = h;

  renderSheetBody(staff, expenses);
  document.getElementById('saveAllBtn').onclick = saveAll;
}

// ── SHEET RENDERING ────────────────────────────────────────────

function sheetDayCell(monthly, date, weClass) {
  // Show daily value whenever that day has data, including zero values
  const show = (date in state.dataMap);
  return `<td class="col-day cell-calc${weClass}">${show ? fmtShort(monthly / state.days) : ''}</td>`;
}

function hasAnyDailyEntries() {
  return Object.keys(state.dataMap || {}).length > 0;
}

function enteredDaysCount() {
  return Object.keys(state.dataMap || {}).length;
}

function buildStaffRow(s) {
  const we = d => state.isWE(d) ? ' weekend' : '';
  const showTotals = hasAnyDailyEntries();
  const activeDays = enteredDaysCount();
  let r = `<tr class="row-staff" data-id="${s.id}">`;
  r += `<td class="col-sticky col-name"><span class="row-label">${s.name}</span>`;
  r += `<button class="btn-del-row" data-id="${s.id}" data-type="staff">×</button></td>`;
  r += `<td class="col-sticky col-monthly"><input type="number" class="monthly-input" data-id="${s.id}" data-type="staff" value="${s.monthly_salary}" min="0"/></td>`;
  state.dayNums.forEach(d => r += sheetDayCell(s.monthly_salary, state.dateFor(d), we(d)));
  r += `<td class="col-total">${showTotals ? fmt((s.monthly_salary / state.days) * activeDays) : ''}</td></tr>`;
  return r;
}

function buildExpRow(e) {
  const we = d => state.isWE(d) ? ' weekend' : '';
  const catAttr = encodeURIComponent(e.category);
  const showTotals = hasAnyDailyEntries();
  const activeDays = enteredDaysCount();
  let r = `<tr class="row-expense" data-cat="${catAttr}">`;
  r += `<td class="col-sticky col-name"><span class="row-label">${e.category}</span>`;
  r += `<button class="btn-del-row" data-cat="${catAttr}" data-type="expense">×</button></td>`;
  r += `<td class="col-sticky col-monthly"><input type="number" class="monthly-input" data-cat="${catAttr}" data-type="expense" value="${e.amount}" min="0"/></td>`;
  state.dayNums.forEach(d => r += sheetDayCell(e.amount, state.dateFor(d), we(d)));
  r += `<td class="col-total">${showTotals ? fmt((e.amount / state.days) * activeDays) : ''}</td></tr>`;
  return r;
}

function renderSheetBody(staff, expenses) {
  const { days, dayNums, dateFor, isWE, dataMap } = state;
  const we = d => isWE(d) ? ' weekend' : '';
  const showTotals = hasAnyDailyEntries();
  const activeDays = enteredDaysCount();
  const blank = `<tr class="row-blank"><td class="col-sticky col-name"></td><td class="col-sticky col-monthly"></td>${'<td></td>'.repeat(days)}<td></td></tr>`;
  const secHdr = t => `<tr class="row-section-header"><td class="col-sticky col-name" colspan="2">${t}</td>${'<td></td>'.repeat(days)}<td></td></tr>`;
  const addBtn = s => `<tr class="row-add-btn"><td class="col-sticky col-name" colspan="2"><button class="btn-add-row" data-section="${s}">＋ Add Row</button></td>${'<td></td>'.repeat(days)}<td></td></tr>`;

  const staffTotal = staff.reduce((s, m) => s + m.monthly_salary, 0);
  const expTotal   = expenses.reduce((s, e) => s + e.amount, 0);

  let b = '';

  // Revenue
  b += '<tr class="row-revenue"><td class="col-sticky col-name fw-bold">Total Revenue</td><td class="col-sticky col-monthly"></td>';
  dayNums.forEach(d => {
    const date = dateFor(d);
    const entry = dataMap[date];
    const val = entry !== undefined ? entry.revenue : '';
    b += `<td class="col-day${we(d)}"><input type="number" class="sheet-input rev-input" data-date="${date}" value="${val}" min="0" placeholder="–"/></td>`;
  });
  b += `<td class="col-total fw-bold" id="sheet-rev-total">${showTotals ? '₹0' : ''}</td></tr>`;

  // Quantity
  b += '<tr class="row-quantity"><td class="col-sticky col-name fw-bold">Total Quantity</td><td class="col-sticky col-monthly"></td>';
  dayNums.forEach(d => {
    const date = dateFor(d);
    const entry = dataMap[date];
    const val = entry !== undefined ? entry.quantity : '';
    b += `<td class="col-day${we(d)}"><input type="number" class="sheet-input qty-input" data-date="${date}" value="${val}" min="0" placeholder="–"/></td>`;
  });
  b += `<td class="col-total fw-bold" id="sheet-qty-total">${showTotals ? '0' : ''}</td></tr>`;

  b += blank;

  // Staff section
  b += secHdr('Fixed Staff Expenses');
  staff.forEach(s => b += buildStaffRow(s));
  b += addBtn('staff');

  // Staff totals row
  b += '<tr class="row-section-total" id="staff-total-row">';
  b += `<td class="col-sticky col-name fw-bold">Staff Total</td><td class="col-sticky col-monthly fw-bold">${fmt(staffTotal)}</td>`;
  dayNums.forEach(d => {
    const show = (dateFor(d) in dataMap);
    b += `<td class="col-day cell-calc fw-bold${we(d)}">${show ? fmtShort(staffTotal / days) : ''}</td>`;
  });
  b += `<td class="col-total fw-bold">${showTotals ? fmt((staffTotal / days) * activeDays) : ''}</td></tr>`;
  b += blank;

  // Expenses section
  b += secHdr('Operating Expenses');
  expenses.forEach(e => b += buildExpRow(e));
  b += addBtn('expense');

  // Expenses totals row
  b += '<tr class="row-section-total" id="exp-total-row">';
  b += `<td class="col-sticky col-name fw-bold">Expenses Total</td><td class="col-sticky col-monthly fw-bold">${fmt(expTotal)}</td>`;
  dayNums.forEach(d => {
    const show = (dateFor(d) in dataMap);
    b += `<td class="col-day cell-calc fw-bold${we(d)}">${show ? fmtShort(expTotal / days) : ''}</td>`;
  });
  b += `<td class="col-total fw-bold">${showTotals ? fmt((expTotal / days) * activeDays) : ''}</td></tr>`;
  b += blank;

  // Profit row
  b += '<tr class="row-profit"><td class="col-sticky col-name fw-bold">Profit / Loss</td><td class="col-sticky col-monthly"></td>';
  dayNums.forEach(d => {
    const date = dateFor(d);
    if (date in dataMap) {
      const rev = dataMap[date].revenue || 0;
      const dayTotal = (staffTotal / days) + (expTotal / days);
      const p = rev - (rev * 0.8) - dayTotal;
      b += `<td class="col-day cell-profit${we(d)} ${p >= 0 ? 'positive' : 'negative'}" data-day="${d}">${fmtShort(p)}</td>`;
    } else {
      b += `<td class="col-day cell-profit${we(d)}" data-day="${d}"></td>`;
    }
  });
  const totProfit = Object.entries(dataMap).reduce((sum, [, day]) => {
    const rev = day?.revenue || 0;
    const dayTotal = (staffTotal / days) + (expTotal / days);
    return sum + (rev - (rev * 0.8) - dayTotal);
  }, 0);
  b += `<td class="col-total fw-bold ${totProfit >= 0 ? 'text-profit' : 'text-loss'}" id="sheet-profit-total">${showTotals ? fmt(totProfit) : ''}</td></tr>`;

  const tbody = document.getElementById('sheetBody');
  tbody.innerHTML = b;
  normalizeStickyColumns();
  clearSheetSelection();
  refreshRevQtyTotals();
  attachSheetEvents(tbody);
  applyEntryEditMode();
  applySheetFreeze();
  requestAnimationFrame(applySheetFreeze);
}

function normalizeStickyColumns() {
  const thead = document.getElementById('sheetHead');
  const tbody = document.getElementById('sheetBody');
  if (thead) {
    Array.from(thead.rows).forEach(tr => {
      const c1 = tr.cells[0];
      const c2 = tr.cells[1];
      if (c1) c1.classList.add('col-sticky', 'col-name');
      if (c2) c2.classList.add('col-sticky', 'col-monthly');
    });
  }
  if (!tbody) return;
  Array.from(tbody.rows).forEach(tr => {
    const c1 = tr.cells[0];
    const c2 = tr.cells[1];
    if (c1) c1.classList.add('col-sticky', 'col-name');
    // Skip rows where first cell spans both frozen columns (section headers/add rows)
    if (c2 && (c1?.colSpan || 1) === 1) c2.classList.add('col-sticky', 'col-monthly');
  });
}

// ── SHEET EVENTS ───────────────────────────────────────────────

function applySheetFreeze() {
  const thead = document.getElementById('sheetHead');
  const tbody = document.getElementById('sheetBody');
  if (!thead || !tbody) return;

  const headRows = Array.from(thead.querySelectorAll('tr'));
  headRows.forEach(tr => {
    tr.classList.remove('freeze-head-row');
    tr.style.removeProperty('--freeze-top');
  });

  let top = 0;
  headRows.forEach(tr => {
    tr.classList.add('freeze-head-row');
    tr.style.setProperty('--freeze-top', `${Math.round(top)}px`);
    top += tr.getBoundingClientRect().height;
  });

  const rows = Array.from(tbody.querySelectorAll('tr'));
  rows.forEach(tr => {
    tr.classList.remove('frozen-row');
    tr.style.removeProperty('--freeze-top');
  });

  const frozenRows = rows.slice(0, 2); // Revenue + Quantity rows
  frozenRows.forEach(tr => {
    tr.classList.add('frozen-row');
    tr.style.setProperty('--freeze-top', `${Math.round(top)}px`);
    top += tr.getBoundingClientRect().height;
  });
}

function clearSheetSelection() {
  state.sheetSelection.cells.forEach(cell => cell.classList.remove('cell-selected'));
  state.sheetSelection.cells.clear();
  state.sheetSelection.anchor = null;
}

function getCellLogicalCoords(cell) {
  const tr = cell.closest('tr');
  const rowEl = tr?.parentElement;
  if (!tr || !rowEl) return null;
  const row = Array.from(rowEl.children).indexOf(tr);
  let col = 0;
  Array.from(tr.cells).some(c => {
    if (c === cell) return true;
    col += c.colSpan || 1;
    return false;
  });
  return { row, col };
}

function getCellsInRange(tbody, from, to) {
  const minRow = Math.min(from.row, to.row);
  const maxRow = Math.max(from.row, to.row);
  const minCol = Math.min(from.col, to.col);
  const maxCol = Math.max(from.col, to.col);
  const rows = Array.from(tbody.rows);
  const out = [];

  for (let r = minRow; r <= maxRow; r++) {
    const tr = rows[r];
    if (!tr) continue;
    let colCursor = 0;
    Array.from(tr.cells).forEach(cell => {
      const span = cell.colSpan || 1;
      const cStart = colCursor;
      const cEnd = cStart + span - 1;
      if (cEnd >= minCol && cStart <= maxCol) out.push(cell);
      colCursor += span;
    });
  }
  return out;
}

function addCellsToSelection(cells) {
  cells.forEach(cell => {
    state.sheetSelection.cells.add(cell);
    cell.classList.add('cell-selected');
  });
}

function setSingleSelection(cell) {
  clearSheetSelection();
  addCellsToSelection([cell]);
  state.sheetSelection.anchor = getCellLogicalCoords(cell);
}

function toggleCellSelection(cell) {
  if (state.sheetSelection.cells.has(cell)) {
    state.sheetSelection.cells.delete(cell);
    cell.classList.remove('cell-selected');
  } else {
    state.sheetSelection.cells.add(cell);
    cell.classList.add('cell-selected');
  }
  state.sheetSelection.anchor = getCellLogicalCoords(cell);
}

function selectRangeToCell(tbody, cell, additive = false) {
  const target = getCellLogicalCoords(cell);
  if (!target) return;
  const anchor = state.sheetSelection.anchor || target;
  const rangeCells = getCellsInRange(tbody, anchor, target);
  if (!additive) clearSheetSelection();
  addCellsToSelection(rangeCells);
  state.sheetSelection.anchor = anchor;
}

async function saveInlineNameChange(tr, oldName, newName) {
  if (!newName || newName === oldName) return { ok: true, name: oldName };
  if (tr.classList.contains('row-staff')) {
    const inp = tr.querySelector('.monthly-input[data-type="staff"]');
    const id = inp?.dataset?.id;
    const monthlySalary = parseFloat(inp?.value) || 0;
    if (!id) return { ok: false };
    await api(`/api/staff/${id}`, 'PUT', { name: newName, monthly_salary: monthlySalary });
    return { ok: true, name: newName };
  }
  if (tr.classList.contains('row-expense')) {
    const inp = tr.querySelector('.monthly-input[data-type="expense"]');
    const delBtn = tr.querySelector('.btn-del-row[data-type="expense"]');
    const oldCat = decodeURIComponent(inp?.dataset?.cat || oldName);
    const amount = parseFloat(inp?.value) || 0;
    await api(`/api/expenses/${state.year}/${state.month}/${encodeURIComponent(oldCat)}`, 'DELETE');
    await api('/api/expenses', 'POST', { year: state.year, month: state.month, category: newName, amount });
    const enc = encodeURIComponent(newName);
    tr.dataset.cat = enc;
    if (inp) inp.dataset.cat = enc;
    if (delBtn) delBtn.dataset.cat = enc;
    return { ok: true, name: newName };
  }
  return { ok: false };
}

function startInlineNameEdit(labelEl) {
  if (!state.entryEditMode) return;
  const tr = labelEl.closest('tr');
  if (!tr) return;
  if (!tr.classList.contains('row-staff') && !tr.classList.contains('row-expense')) return;
  if (tr.querySelector('.row-name-input')) return;

  const oldName = (labelEl.textContent || '').trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'row-name-input';
  input.value = oldName;
  labelEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = async (save) => {
    if (done) return;
    done = true;
    const newLabel = document.createElement('span');
    newLabel.className = 'row-label';
    try {
      const newName = input.value.trim();
      const targetName = save ? newName : oldName;
      if (save && targetName) {
        const res = await saveInlineNameChange(tr, oldName, targetName);
        newLabel.textContent = res.ok ? (res.name || oldName) : oldName;
        if (res.ok && targetName !== oldName) showToast('Name updated');
        if (!res.ok) showToast('Unable to update name', 'danger');
      } else {
        newLabel.textContent = oldName;
      }
    } catch (err) {
      console.error(err);
      newLabel.textContent = oldName;
      showToast('Unable to update name', 'danger');
    }
    input.replaceWith(newLabel);
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function attachSheetEvents(tbody) {
  if (tbody._sheetEventsAttached) return;
  tbody._sheetEventsAttached = true;

  // Arrow key navigation between day cells
  tbody.addEventListener('keydown', e => {
    const inp = e.target;
    const isRev = inp.classList.contains('rev-input');
    const isQty = inp.classList.contains('qty-input');
    if (!isRev && !isQty) return;
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const date = inp.dataset.date;
    const parts = date.split('-');
    const y = parts[0], m = parts[1], d = parseInt(parts[2]);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const nd = d + (e.key === 'ArrowRight' ? 1 : -1);
      const newDate = `${y}-${m}-${String(nd).padStart(2,'0')}`;
      const cls = isRev ? '.rev-input' : '.qty-input';
      const next = document.querySelector(`${cls}[data-date="${newDate}"]`);
      if (next) { next.focus(); next.select(); }
    } else if (e.key === 'ArrowDown' && isRev) {
      const next = document.querySelector(`.qty-input[data-date="${date}"]`);
      if (next) { next.focus(); next.select(); }
    } else if (e.key === 'ArrowUp' && isQty) {
      const next = document.querySelector(`.rev-input[data-date="${date}"]`);
      if (next) { next.focus(); next.select(); }
    }
  });

  // Prevent arrow keys from incrementing number values
  tbody.addEventListener('keydown', e => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement)) return;
    if (inp.type !== 'number') return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
  });

  // Spreadsheet-like multi-select:
  // - Click: single cell
  // - Shift+Click: range from anchor
  // - Cmd/Ctrl+Click: toggle cell in selection
  // - Cmd/Ctrl+Shift+Click: add range
  tbody.addEventListener('mousedown', e => {
    const cell = e.target.closest('td');
    if (!cell) return;
    if (e.target.closest('button')) return;
    if (e.target.closest('input,textarea,select,.row-label')) return;

    const withMeta = e.metaKey || e.ctrlKey;
    if (e.shiftKey) {
      e.preventDefault();
      selectRangeToCell(tbody, cell, withMeta);
      return;
    }
    if (withMeta) {
      e.preventDefault();
      toggleCellSelection(cell);
      return;
    }
    setSingleSelection(cell);
  });

  // Revenue / qty input → update dataMap + refresh day column
  tbody.addEventListener('input', e => {
    const inp = e.target;
    if (!inp.classList.contains('rev-input') && !inp.classList.contains('qty-input')) return;
    const date = inp.dataset.date;
    const dayNum = parseInt(date.split('-')[2]);
    const revInp = document.querySelector(`.rev-input[data-date="${date}"]`);
    const qtyInp = document.querySelector(`.qty-input[data-date="${date}"]`);
    if (revInp.value !== '' || qtyInp.value !== '') {
      state.dataMap[date] = { revenue: parseFloat(revInp.value) || 0, quantity: parseInt(qtyInp.value) || 0 };
    } else {
      delete state.dataMap[date];
    }
    refreshDayColumn(dayNum);
    refreshSectionTotals();
    refreshRevQtyTotals();
    refreshProfitTotal();
  });

  // Monthly input blur → save to API, refresh display
  tbody.addEventListener('change', async e => {
    const inp = e.target;
    if (!inp.classList.contains('monthly-input') || inp.classList.contains('new-monthly')) return;
    if (!state.entryEditMode) {
      inp.value = inp.defaultValue;
      return;
    }
    const amount = parseFloat(inp.value) || 0;
    const tr = inp.closest('tr');
    const activeDays = enteredDaysCount();
    tr.cells[tr.cells.length - 1].textContent = hasAnyDailyEntries() ? fmt((amount / state.days) * activeDays) : ''; // update row total

    if (inp.dataset.type === 'staff') {
      const name = tr.querySelector('.row-label').textContent;
      await api(`/api/staff/${inp.dataset.id}`, 'PUT', { name, monthly_salary: amount });
    } else {
      const cat = decodeURIComponent(inp.dataset.cat);
      await api('/api/expenses', 'POST', { year: state.year, month: state.month, category: cat, amount });
    }
    refreshSectionTotals();
    refreshAllDayColumns();
    inp.defaultValue = String(amount);
  });

  // Delete row
  tbody.addEventListener('click', async e => {
    const btn = e.target.closest('.btn-del-row');
    if (!btn) return;
    if (!state.entryEditMode) return;
    if (!confirm('Delete this row?')) return;
    if (btn.dataset.type === 'staff') {
      await api(`/api/staff/${btn.dataset.id}`, 'DELETE');
    } else {
      const cat = decodeURIComponent(btn.dataset.cat);
      await api(`/api/expenses/${state.year}/${state.month}/${encodeURIComponent(cat)}`, 'DELETE');
    }
    btn.closest('tr').remove();
    refreshSectionTotals();
    refreshAllDayColumns();
  });

  // Add row
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('.btn-add-row');
    if (!state.entryEditMode) return;
    if (btn) insertNewRow(btn.dataset.section, btn.closest('tr'));
  });

  // Inline rename in first column (click directly on text)
  tbody.addEventListener('click', e => {
    const labelEl = e.target.closest('.row-label');
    if (!labelEl) return;
    if (!state.entryEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    startInlineNameEdit(labelEl);
  });
}

window.addEventListener('resize', () => {
  if (state.currentPage === 'entry' && state.entryView !== 'total') applySheetFreeze();
});

const sheetScrollEl = document.getElementById('sheetScroll');
if (sheetScrollEl) {
  sheetScrollEl.addEventListener('scroll', () => {
    if (state.currentPage === 'entry' && state.entryView !== 'total') applySheetFreeze();
  }, { passive: true });
}

document.addEventListener('mousedown', e => {
  const inSheet = e.target.closest('#sheetTable');
  if (!inSheet) clearSheetSelection();
});

function insertNewRow(section, addBtnRow) {
  if (!state.entryEditMode) return;
  const { days, dayNums, isWE } = state;
  const isStaff = section === 'staff';
  const emptyCells = dayNums.map(d => `<td class="col-day cell-calc${isWE(d) ? ' weekend' : ''}"></td>`).join('');
  const tr = document.createElement('tr');
  tr.className = isStaff ? 'row-staff' : 'row-expense';
  tr.innerHTML = `
    <td class="col-sticky col-name">
      <input class="new-name sheet-input" placeholder="${isStaff ? 'Name…' : 'Category…'}" style="width:90%"/>
    </td>
    <td class="col-sticky col-monthly">
      <input type="number" class="monthly-input new-monthly" placeholder="0" min="0" style="width:80px"/>
    </td>
    ${emptyCells}
    <td class="col-total"><button class="btn btn-sm btn-success save-new-row" style="padding:1px 8px;font-size:11px">✓</button></td>`;
  addBtnRow.before(tr);
  tr.querySelector('.new-name').focus();

  const save = async () => {
    const name   = tr.querySelector('.new-name').value.trim();
    const amount = parseFloat(tr.querySelector('.new-monthly').value) || 0;
    if (!name) { showToast('Enter a name', 'danger'); return; }
    if (isStaff) {
      const created = await api('/api/staff', 'POST', { name, monthly_salary: amount });
      tr.outerHTML = buildStaffRow({ id: created.id, name, monthly_salary: amount });
    } else {
      await api('/api/expenses', 'POST', { year: state.year, month: state.month, category: name, amount });
      tr.outerHTML = buildExpRow({ category: name, amount });
    }
    refreshSectionTotals();
    showToast('Row added!');
  };
  tr.querySelector('.save-new-row').addEventListener('click', save);
  tr.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
}

// ── SHEET REFRESH HELPERS ──────────────────────────────────────

function getStaffTotal() {
  return Array.from(document.querySelectorAll('.row-staff .monthly-input'))
    .reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
}
function getExpTotal() {
  return Array.from(document.querySelectorAll('.row-expense .monthly-input'))
    .reduce((s, i) => s + (parseFloat(i.value) || 0), 0);
}

function refreshDayColumn(dayNum) {
  // Called when a single day's revenue changes
  const { days, dateFor, isWE, dataMap } = state;
  const date    = dateFor(dayNum);
  const hasEntry = date in dataMap;
  const ci       = dayNum + 1;  // 0-indexed: 0=name, 1=monthly, 2=day1 → dayNum+1
  const staffTotal = getStaffTotal();
  const expTotal   = getExpTotal();

  document.querySelectorAll('.row-staff:not(.row-blank)').forEach(tr => {
    if (!tr.cells[ci]) return;
    const m = parseFloat(tr.querySelector('.monthly-input')?.value) || 0;
    tr.cells[ci].textContent = hasEntry && m > 0 ? fmtShort(m / days) : '';
  });

  const stRow = document.getElementById('staff-total-row');
  if (stRow?.cells[ci]) stRow.cells[ci].textContent = hasEntry ? fmtShort(staffTotal / days) : '';

  document.querySelectorAll('.row-expense:not(.row-blank)').forEach(tr => {
    if (!tr.cells[ci]) return;
    const m = parseFloat(tr.querySelector('.monthly-input')?.value) || 0;
    tr.cells[ci].textContent = hasEntry && m > 0 ? fmtShort(m / days) : '';
  });

  const etRow = document.getElementById('exp-total-row');
  if (etRow?.cells[ci]) etRow.cells[ci].textContent = hasEntry ? fmtShort(expTotal / days) : '';

  const profCell = document.querySelector(`.cell-profit[data-day="${dayNum}"]`);
  if (profCell) {
    if (hasEntry) {
      const rev = parseFloat(document.querySelector(`.rev-input[data-date="${date}"]`)?.value) || 0;
      const dayTotal = (staffTotal / days) + (expTotal / days);
      const p = rev - (rev * 0.8) - dayTotal;
      profCell.textContent = fmtShort(p);
      profCell.className = `col-day cell-profit${isWE(dayNum) ? ' weekend' : ''} ${p >= 0 ? 'positive' : 'negative'}`;
    } else {
      profCell.textContent = '';
      profCell.className = `col-day cell-profit${isWE(dayNum) ? ' weekend' : ''}`;
    }
  }
}

function refreshAllDayColumns() {
  state.dayNums.forEach(d => refreshDayColumn(d));
}

function refreshSectionTotals() {
  // Updates the monthly + total cells of the section total rows
  const staffTotal = getStaffTotal();
  const expTotal   = getExpTotal();
  const showTotals = hasAnyDailyEntries();
  const activeDays = enteredDaysCount();
  const stRow = document.getElementById('staff-total-row');
  if (stRow) { stRow.cells[1].textContent = fmt(staffTotal); stRow.cells[stRow.cells.length - 1].textContent = showTotals ? fmt((staffTotal / state.days) * activeDays) : ''; }
  const etRow = document.getElementById('exp-total-row');
  if (etRow) { etRow.cells[1].textContent = fmt(expTotal); etRow.cells[etRow.cells.length - 1].textContent = showTotals ? fmt((expTotal / state.days) * activeDays) : ''; }

  document.querySelectorAll('.row-staff .col-total, .row-expense .col-total').forEach(cell => {
    const tr = cell.closest('tr');
    const m = parseFloat(tr?.querySelector('.monthly-input')?.value) || 0;
    cell.textContent = showTotals ? fmt((m / state.days) * activeDays) : '';
  });
}

function refreshRevQtyTotals() {
  const showTotals = hasAnyDailyEntries();
  let rev = 0, qty = 0;
  document.querySelectorAll('.rev-input').forEach(i => rev += parseFloat(i.value) || 0);
  document.querySelectorAll('.qty-input').forEach(i => qty += parseFloat(i.value) || 0);
  const re = document.getElementById('sheet-rev-total'); if (re) re.textContent = showTotals ? fmt(rev) : '';
  const qe = document.getElementById('sheet-qty-total'); if (qe) qe.textContent = showTotals ? fmtNum(qty) : '';
}

function refreshProfitTotal() {
  const showTotals = hasAnyDailyEntries();
  const staffTotal = getStaffTotal();
  const expTotal   = getExpTotal();
  const dayTotal = (staffTotal / state.days) + (expTotal / state.days);
  const totProfit = Object.entries(state.dataMap || {}).reduce((sum, [, day]) => {
    const rev = day?.revenue || 0;
    return sum + (rev - (rev * 0.8) - dayTotal);
  }, 0);
  const el = document.getElementById('sheet-profit-total');
  if (el) { el.textContent = showTotals ? fmt(totProfit) : ''; el.className = `col-total fw-bold ${totProfit >= 0 ? 'text-profit' : 'text-loss'}`; }
}

async function saveAll() {
  const revInputs = document.querySelectorAll('.rev-input');
  for (const inp of revInputs) {
    if (inp.value === '') continue;           // blank = not yet entered, skip
    const date = inp.dataset.date;
    const rev  = parseFloat(inp.value) || 0;
    const qtyInp = document.querySelector(`.qty-input[data-date="${date}"]`);
    const qty  = parseInt(qtyInp?.value) || 0;
    await api('/api/daily', 'POST', { date, revenue: rev, quantity: qty });
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

// ── SHIPMENTS ──────────────────────────────────────────────────
let _shipmentsData = null;

async function loadShipments() {
  if (!_shipmentsData) {
    _shipmentsData = await api('/api/shipments');
  }
  renderShipmentsTable(_shipmentsData);

  // Attach filter/search events only once
  const searchEl = document.getElementById('shipmentsSearch');
  const filterEl = document.getElementById('shipmentsFilter');
  if (!searchEl._init) {
    searchEl._init = true;
    const refresh = () => renderShipmentsTable(_shipmentsData);
    searchEl.addEventListener('input', refresh);
    filterEl.addEventListener('change', refresh);
  }
}

function shipmentRowNumber(v) {
  if (v === '' || v == null) return '';
  const n = Number(v);
  return Number.isFinite(n) ? n : '';
}

function escAttr(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function shipmentRowNumInput(v) {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '';
}

async function saveShipmentRow(rowIndex, tr) {
  const payload = {
    date: tr.querySelector('[data-f="date"]')?.value || '',
    type: tr.querySelector('[data-f="type"]')?.value || 'shipment',
    invoice: tr.querySelector('[data-f="invoice"]')?.value || '',
    stock_value_usd: shipmentRowNumber(tr.querySelector('[data-f="stock_value_usd"]')?.value),
    shipping_usd: shipmentRowNumber(tr.querySelector('[data-f="shipping_usd"]')?.value),
    total_usd: shipmentRowNumber(tr.querySelector('[data-f="total_usd"]')?.value),
    amount_usd: shipmentRowNumber(tr.querySelector('[data-f="amount_usd"]')?.value),
    balance_after: tr.querySelector('[data-f="balance_after"]')?.value || ''
  };

  const res = await api(`/api/shipments/${rowIndex}`, 'PUT', payload);
  if (res?.error) throw new Error(res.error);
  _shipmentsData[rowIndex] = { ..._shipmentsData[rowIndex], ...payload };
}

function renderShipmentsTable(data) {
  const search = (document.getElementById('shipmentsSearch')?.value || '').toLowerCase();
  const filter = document.getElementById('shipmentsFilter')?.value || 'all';

  let rows = data.map((r, idx) => ({ ...r, _idx: idx })).filter(r => {
    if (filter !== 'all' && r.type !== filter) return false;
    if (search) {
      const hay = `${r.date||''} ${r.invoice||''} ${r.type}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const tbody = document.getElementById('shipmentsBody');
  tbody.innerHTML = rows.map(r => {
    const isPayment = r.type === 'payment';
    return `<tr data-idx="${r._idx}" class="${isPayment ? 'table-success bg-opacity-25' : ''}">
      <td><input type="date" class="form-control form-control-sm" data-f="date" value="${escAttr(r.date || '')}"></td>
      <td>
        <select class="form-select form-select-sm" data-f="type">
          <option value="shipment" ${r.type === 'shipment' ? 'selected' : ''}>Shipment</option>
          <option value="payment" ${r.type === 'payment' ? 'selected' : ''}>Payment</option>
        </select>
      </td>
      <td><input type="text" class="form-control form-control-sm" data-f="invoice" value="${escAttr(r.invoice || '')}"></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm text-end" data-f="stock_value_usd" value="${shipmentRowNumInput(r.stock_value_usd)}"></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm text-end" data-f="shipping_usd" value="${shipmentRowNumInput(r.shipping_usd)}"></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm text-end" data-f="total_usd" value="${shipmentRowNumInput(r.total_usd)}"></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm text-end" data-f="amount_usd" value="${shipmentRowNumInput(r.amount_usd)}"></td>
      <td><input type="number" step="0.01" class="form-control form-control-sm text-end" data-f="balance_after" value="${shipmentRowNumInput(r.balance_after)}"></td>
      <td><button class="btn btn-sm btn-primary btn-save-shipment">Save</button></td>
    </tr>`;
  }).join('');

  if (!tbody._initSaveHandlers) {
    tbody._initSaveHandlers = true;
    tbody.addEventListener('click', async e => {
      const btn = e.target.closest('.btn-save-shipment');
      if (!btn) return;
      const tr = btn.closest('tr');
      const rowIndex = parseInt(tr?.dataset?.idx || '-1', 10);
      if (!tr || rowIndex < 0) return;
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        await saveShipmentRow(rowIndex, tr);
        btn.textContent = 'Saved';
        setTimeout(() => { btn.textContent = prev; }, 800);
        showToast('Shipment row updated');
      } catch (err) {
        console.error(err);
        btn.textContent = prev;
        showToast('Unable to save shipment row', 'danger');
      } finally {
        btn.disabled = false;
      }
    });
  }
}

// ── BALANCE ────────────────────────────────────────────────────
async function loadBalance() {
  const [balance, shipments] = await Promise.all([
    api('/api/balance'),
    api('/api/shipments')
  ]);

  const fmtUSD = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Summary tiles
  const closingBal = balance.closing_balance_usd || 0;
  const balColor = closingBal >= 0 ? 'bg-success' : 'bg-danger';
  const balLabel = closingBal >= 0 ? 'We have credit' : 'We owe them';

  document.getElementById('balanceSummaryRow').innerHTML = `
    <div class="col-sm-6 col-lg-3">
      <div class="stat-card revenue">
        <div class="stat-icon"><i class="bi bi-arrow-up-circle"></i></div>
        <div class="stat-label">Total Payments Sent</div>
        <div class="stat-value">${fmtUSD(balance.total_payments_usd)}</div>
        <div class="text-muted small mt-1">${balance.total_payments_count || 0} transactions</div>
      </div>
    </div>
    <div class="col-sm-6 col-lg-3">
      <div class="stat-card expenses">
        <div class="stat-icon"><i class="bi bi-box-seam"></i></div>
        <div class="stat-label">Total Shipment Cost</div>
        <div class="stat-value">${fmtUSD(balance.total_shipment_cost_usd)}</div>
        <div class="text-muted small mt-1">${balance.total_shipments || 0} shipments</div>
      </div>
    </div>
    <div class="col-sm-6 col-lg-3">
      <div class="stat-card expenses">
        <div class="stat-icon"><i class="bi bi-truck"></i></div>
        <div class="stat-label">Shipping Costs</div>
        <div class="stat-value">${fmtUSD(balance.total_shipping_usd)}</div>
        <div class="text-muted small mt-1">of total shipment cost</div>
      </div>
    </div>
    <div class="col-sm-6 col-lg-3">
      <div class="stat-card ${closingBal >= 0 ? 'profit' : 'expenses'}">
        <div class="stat-icon"><i class="bi bi-wallet"></i></div>
        <div class="stat-label">Closing Balance</div>
        <div class="stat-value ${closingBal >= 0 ? 'text-success' : 'text-danger'}">${fmtUSD(Math.abs(closingBal))}</div>
        <div class="text-muted small mt-1">${balLabel}</div>
      </div>
    </div>`;

  // Recent activity
  const recent = shipments.slice(-20).reverse();
  const tbody = document.getElementById('balanceRecentBody');
  tbody.innerHTML = recent.map(r => {
    const isShip = r.type === 'shipment';
    const typeLabel = isShip
      ? '<span class="badge bg-primary">Shipment</span>'
      : '<span class="badge bg-success">Payment</span>';
    const amtCol = isShip
      ? `<td class="text-end text-danger">(${fmtUSD(r.total_usd)})</td>`
      : `<td class="text-end text-success">${fmtUSD(r.amount_usd)}</td>`;
    const bal = r.balance_after;
    const balStr = bal != null
      ? `<span class="${bal < 0 ? 'text-danger' : 'text-success'}">${bal < 0 ? '(' : ''}${fmtUSD(Math.abs(bal))}${bal < 0 ? ')' : ''}</span>`
      : '—';
    return `<tr>
      <td>${r.date || '—'}</td>
      <td>${typeLabel}</td>
      <td><small class="text-muted">${r.invoice || '—'}</small></td>
      ${amtCol}
      <td class="text-end">${balStr}</td>
    </tr>`;
  }).join('');

  // Yearly payments bar chart
  const yearMap = {};
  shipments.filter(r => r.type === 'payment' && r.date).forEach(r => {
    const yr = r.date.slice(0, 4);
    yearMap[yr] = (yearMap[yr] || 0) + r.amount_usd;
  });
  const yearLabels = Object.keys(yearMap).sort();
  const yearVals = yearLabels.map(y => yearMap[y]);

  destroyChart('balPayments');
  state.charts.balPayments = new Chart(document.getElementById('balancePaymentsChart'), {
    type: 'bar',
    data: {
      labels: yearLabels,
      datasets: [{ label: 'Payments (USD)', data: yearVals, backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 4 }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { ticks: { callback: v => '$' + (v/1000).toFixed(0) + 'k' } } }
    }
  });

  // Pie chart
  destroyChart('balPie');
  state.charts.balPie = new Chart(document.getElementById('balancePieChart'), {
    type: 'doughnut',
    data: {
      labels: ['Stock Value', 'Shipping', 'Balance Owed/Credit'],
      datasets: [{
        data: [
          balance.total_stock_value_usd,
          balance.total_shipping_usd,
          Math.abs(balance.total_payments_usd - balance.total_shipment_cost_usd)
        ],
        backgroundColor: ['#3b82f6', '#f97316', closingBal >= 0 ? '#22c55e' : '#ef4444'],
        borderWidth: 2
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

// ── INIT ───────────────────────────────────────────────────────
updateLabels();
loadDashboard();
