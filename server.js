require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const USE_PG = !!process.env.DATABASE_URL;

// ── DATABASE SETUP ─────────────────────────────────────────────

let pgPool = null;

if (USE_PG) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  // Create tables on startup
  pgPool.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      monthly_salary REAL NOT NULL DEFAULT 0,
      active BOOLEAN DEFAULT TRUE
    );
    CREATE TABLE IF NOT EXISTS daily_data (
      date TEXT NOT NULL,
      revenue REAL DEFAULT 0,
      quantity INTEGER DEFAULT 0,
      PRIMARY KEY (date)
    );
    CREATE TABLE IF NOT EXISTS expenses (
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      category TEXT NOT NULL,
      amount REAL DEFAULT 0,
      PRIMARY KEY (year, month, category)
    );
  `).then(() => console.log('✅ PostgreSQL tables ready'))
    .catch(err => console.error('DB init error:', err));

} else {
  // Local JSON file storage
  const DATA_DIR = './data';
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  console.log('📁 Using local JSON file storage');
}

// ── JSON FILE HELPERS (local only) ────────────────────────────

const DATA_DIR = './data';

function readFile(filename) {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function writeFile(filename, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}
function getStaff() { return readFile('staff.json') || []; }
function saveStaff(data) { writeFile('staff.json', data); }
function getDailyData(year, month) {
  return readFile(`daily_${year}_${String(month).padStart(2,'0')}.json`) || {};
}
function saveDailyData(year, month, data) {
  writeFile(`daily_${year}_${String(month).padStart(2,'0')}.json`, data);
}
function getExpenses(year, month) {
  return readFile(`expenses_${year}_${String(month).padStart(2,'0')}.json`) || {};
}
function saveExpenses(year, month, data) {
  writeFile(`expenses_${year}_${String(month).padStart(2,'0')}.json`, data);
}
function nextId(arr) {
  return arr.length === 0 ? 1 : Math.max(...arr.map(s => s.id)) + 1;
}

// ── MIDDLEWARE ─────────────────────────────────────────────────
app.use(express.json());
app.use(express.static('public'));

// ── STAFF ROUTES ──────────────────────────────────────────────

app.get('/api/staff', async (req, res) => {
  try {
    if (USE_PG) {
      const result = await pgPool.query('SELECT * FROM staff WHERE active = TRUE ORDER BY name');
      return res.json(result.rows);
    }
    res.json(getStaff().filter(s => s.active !== false).sort((a,b) => a.name.localeCompare(b.name)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/staff', async (req, res) => {
  const { name, monthly_salary } = req.body;
  if (!name || monthly_salary == null) return res.status(400).json({ error: 'Name and salary required' });
  try {
    if (USE_PG) {
      const result = await pgPool.query(
        'INSERT INTO staff (name, monthly_salary) VALUES ($1, $2) RETURNING *',
        [name, parseFloat(monthly_salary)]
      );
      return res.json(result.rows[0]);
    }
    const staff = getStaff();
    const newMember = { id: nextId(staff), name, monthly_salary: parseFloat(monthly_salary), active: true };
    staff.push(newMember);
    saveStaff(staff);
    res.json(newMember);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/staff/:id', async (req, res) => {
  const { name, monthly_salary } = req.body;
  try {
    if (USE_PG) {
      await pgPool.query('UPDATE staff SET name=$1, monthly_salary=$2 WHERE id=$3',
        [name, parseFloat(monthly_salary), req.params.id]);
      return res.json({ success: true });
    }
    const staff = getStaff();
    const idx = staff.findIndex(s => s.id === parseInt(req.params.id));
    if (idx !== -1) { staff[idx] = { ...staff[idx], name, monthly_salary: parseFloat(monthly_salary) }; saveStaff(staff); }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/staff/:id', async (req, res) => {
  try {
    if (USE_PG) {
      await pgPool.query('UPDATE staff SET active=FALSE WHERE id=$1', [req.params.id]);
      return res.json({ success: true });
    }
    const staff = getStaff();
    const idx = staff.findIndex(s => s.id === parseInt(req.params.id));
    if (idx !== -1) { staff[idx].active = false; saveStaff(staff); }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DAILY DATA ROUTES ─────────────────────────────────────────

app.get('/api/daily/:year/:month', async (req, res) => {
  const { year, month } = req.params;
  try {
    if (USE_PG) {
      const m = String(month).padStart(2,'0');
      const result = await pgPool.query(
        `SELECT * FROM daily_data WHERE date LIKE $1 ORDER BY date`,
        [`${year}-${m}-%`]
      );
      return res.json(result.rows);
    }
    res.json(Object.values(getDailyData(year, month)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/daily', async (req, res) => {
  const { date, revenue, quantity } = req.body;
  const [year, month] = date.split('-');
  try {
    if (USE_PG) {
      await pgPool.query(
        `INSERT INTO daily_data (date, revenue, quantity) VALUES ($1,$2,$3)
         ON CONFLICT (date) DO UPDATE SET revenue=EXCLUDED.revenue, quantity=EXCLUDED.quantity`,
        [date, parseFloat(revenue)||0, parseInt(quantity)||0]
      );
      return res.json({ success: true });
    }
    const data = getDailyData(year, month);
    data[date] = { date, revenue: parseFloat(revenue)||0, quantity: parseInt(quantity)||0 };
    saveDailyData(year, month, data);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── EXPENSES ROUTES ───────────────────────────────────────────

app.get('/api/expenses/:year/:month', async (req, res) => {
  const { year, month } = req.params;
  try {
    if (USE_PG) {
      const result = await pgPool.query(
        'SELECT * FROM expenses WHERE year=$1 AND month=$2', [year, month]);
      return res.json(result.rows);
    }
    res.json(Object.values(getExpenses(year, month)));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/expenses', async (req, res) => {
  const { year, month, category, amount } = req.body;
  try {
    if (USE_PG) {
      await pgPool.query(
        `INSERT INTO expenses (year,month,category,amount) VALUES ($1,$2,$3,$4)
         ON CONFLICT (year,month,category) DO UPDATE SET amount=EXCLUDED.amount`,
        [year, month, category, parseFloat(amount)||0]
      );
      return res.json({ success: true });
    }
    const data = getExpenses(year, month);
    data[category] = { category, amount: parseFloat(amount)||0 };
    saveExpenses(year, month, data);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/expenses/:year/:month/:category', async (req, res) => {
  const { year, month, category } = req.params;
  const cat = decodeURIComponent(category);
  try {
    if (USE_PG) {
      await pgPool.query('DELETE FROM expenses WHERE year=$1 AND month=$2 AND category=$3',
        [year, month, cat]);
      return res.json({ success: true });
    }
    const data = getExpenses(year, month);
    delete data[cat];
    saveExpenses(year, month, data);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── ANALYSIS ROUTE ────────────────────────────────────────────

app.get('/api/analysis/:year/:month', async (req, res) => {
  const { year, month } = req.params;
  try {
    let dailyData, staff, expenses;
    if (USE_PG) {
      const m = String(month).padStart(2,'0');
      dailyData = (await pgPool.query(`SELECT * FROM daily_data WHERE date LIKE $1`, [`${year}-${m}-%`])).rows;
      staff = (await pgPool.query('SELECT * FROM staff WHERE active=TRUE')).rows;
      expenses = (await pgPool.query('SELECT * FROM expenses WHERE year=$1 AND month=$2', [year, month])).rows;
    } else {
      dailyData = Object.values(getDailyData(year, month));
      staff = getStaff().filter(s => s.active !== false);
      expenses = Object.values(getExpenses(year, month));
    }
    const totalRevenue = dailyData.reduce((s,d) => s+(d.revenue||0), 0);
    const totalQuantity = dailyData.reduce((s,d) => s+(d.quantity||0), 0);
    const totalStaffCost = staff.reduce((s,st) => s+st.monthly_salary, 0);
    const totalOtherExpenses = expenses.reduce((s,e) => s+e.amount, 0);
    const totalExpenses = totalStaffCost + totalOtherExpenses;
    const profit = totalRevenue - totalExpenses;
    const activeDays = dailyData.filter(d => d.revenue > 0).length;
    const avgDailyRevenue = activeDays > 0 ? totalRevenue / activeDays : 0;
    res.json({ totalRevenue, totalQuantity, totalStaffCost, totalOtherExpenses,
      totalExpenses, profit, avgDailyRevenue, dailyData, staff, expenses });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── YEARLY SUMMARY ────────────────────────────────────────────

app.get('/api/yearly/:year', async (req, res) => {
  const { year } = req.params;
  try {
    let staff;
    if (USE_PG) {
      staff = (await pgPool.query('SELECT * FROM staff WHERE active=TRUE')).rows;
    } else {
      staff = getStaff().filter(s => s.active !== false);
    }
    const totalStaffCost = staff.reduce((s,st) => s+st.monthly_salary, 0);
    const months = [];
    for (let m = 1; m <= 12; m++) {
      let dailyData, expenses;
      if (USE_PG) {
        const mStr = String(m).padStart(2,'0');
        dailyData = (await pgPool.query(`SELECT * FROM daily_data WHERE date LIKE $1`, [`${year}-${mStr}-%`])).rows;
        expenses = (await pgPool.query('SELECT * FROM expenses WHERE year=$1 AND month=$2', [year, m])).rows;
      } else {
        dailyData = Object.values(getDailyData(year, m));
        expenses = Object.values(getExpenses(year, m));
      }
      const revenue = dailyData.reduce((s,d) => s+(d.revenue||0), 0);
      const otherExpenses = expenses.reduce((s,e) => s+e.amount, 0);
      months.push({ month: m, revenue, staffCost: totalStaffCost,
        otherExpenses, profit: revenue - totalStaffCost - otherExpenses });
    }
    res.json(months);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Serve index for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Aisling Equation running → http://localhost:${PORT}`);
  console.log(`   Database: ${USE_PG ? 'PostgreSQL (Railway)' : 'Local JSON files'}`);
});
