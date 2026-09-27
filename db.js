// Database layer — node:sqlite (Node 22+, koi native dependency nahi)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'panel.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new DatabaseSync(DB_FILE);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  whatsapp TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance REAL DEFAULT 0,
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  rate_per_1000 REAL NOT NULL,
  min_qty INTEGER DEFAULT 100,
  max_qty INTEGER DEFAULT 100000,
  description TEXT DEFAULT '',
  provider_service_id TEXT DEFAULT '',
  active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  link TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  charge REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  provider_order_id TEXT DEFAULT '',
  remains INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  method TEXT NOT NULL,
  amount REAL NOT NULL,
  transaction_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
`);

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value ?? ''));
}

// ---- seed: sample services (admin baad mein rates edit kar sakta hai) ----
const svcCount = db.prepare('SELECT COUNT(*) AS c FROM services').get().c;
if (svcCount === 0) {
  const seed = [
    ['TikTok', 'TikTok Followers | Real & Active', 850, 100, 500000, 'High quality followers, slow natural speed', ''],
    ['TikTok', 'TikTok Likes | Instant', 450, 50, 200000, 'Post/video likes, fast start', ''],
    ['TikTok', 'TikTok Views | Instant', 120, 500, 10000000, 'Video views, super fast', ''],
    ['TikTok', 'TikTok Shares', 300, 100, 100000, 'Video shares', ''],
    ['YouTube', 'YouTube Subscribers | Non-Drop', 2500, 50, 100000, 'Slow natural growth, refill guarantee', ''],
    ['YouTube', 'YouTube Views | Monetizable', 900, 500, 5000000, 'High retention views', ''],
    ['YouTube', 'YouTube Likes', 600, 50, 200000, 'Video likes', ''],
    ['YouTube', 'YouTube Watch Time (Hours)', 4500, 100, 4000, '4000 hours watch time package', ''],
    ['Instagram', 'Instagram Followers | Real', 700, 100, 500000, 'Real looking followers', ''],
    ['Instagram', 'Instagram Likes | Instant', 350, 50, 200000, 'Post likes, instant start', ''],
    ['Instagram', 'Instagram Views (Reels)', 100, 500, 10000000, 'Reels/video views', ''],
    ['Facebook', 'Facebook Page Likes + Follows', 800, 100, 200000, 'Page likes with follows', ''],
    ['Facebook', 'Facebook Post Likes', 400, 50, 100000, 'Post/reaction likes', ''],
  ];
  const ins = db.prepare('INSERT INTO services (platform, name, rate_per_1000, min_qty, max_qty, description, provider_service_id) VALUES (?,?,?,?,?,?,?)');
  for (const s of seed) ins.run(...s);
}

// ---- seed: default payment settings (admin change karega) ----
for (const [k, v] of [
  ['jazzcash_number', '0300-0000000'],
  ['jazzcash_name', 'Imran Salara'],
  ['easypaisa_number', '0346-0000000'],
  ['easypaisa_name', 'Imran Salara'],
  ['bank_detail', 'Bank: — | Account: —'],
  ['support_whatsapp', '923046123264'],
  ['panel_name', 'Salara SMM Panel'],
  ['currency', 'PKR'],
]) {
  if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(k)) setSetting(k, v);
}

module.exports = {
  db, getSetting, setSetting,
  // users
  getUserByWhatsapp: (w) => db.prepare('SELECT * FROM users WHERE whatsapp = ?').get(w),
  getUserById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  countUsers: () => db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
  createUser: (name, whatsapp, hash, isAdmin) =>
    db.prepare('INSERT INTO users (name, whatsapp, password_hash, is_admin) VALUES (?,?,?,?)').run(name, whatsapp, hash, isAdmin ? 1 : 0).lastInsertRowid,
  addBalance: (userId, amount) => db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId),
  deductBalance: (userId, amount) => {
    const u = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
    if (!u || u.balance < amount) return false;
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, userId);
    return true;
  },
  // services
  listServices: (activeOnly = true) =>
    db.prepare(`SELECT * FROM services ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY platform, rate_per_1000`).all(),
  getService: (id) => db.prepare('SELECT * FROM services WHERE id = ?').get(id),
  createService: (s) => db.prepare('INSERT INTO services (platform,name,rate_per_1000,min_qty,max_qty,description,provider_service_id) VALUES (?,?,?,?,?,?,?)')
    .run(s.platform, s.name, s.rate_per_1000, s.min_qty, s.max_qty, s.description || '', s.provider_service_id || '').lastInsertRowid,
  updateService: (id, s) => db.prepare('UPDATE services SET platform=?,name=?,rate_per_1000=?,min_qty=?,max_qty=?,description=?,provider_service_id=?,active=? WHERE id=?')
    .run(s.platform, s.name, s.rate_per_1000, s.min_qty, s.max_qty, s.description || '', s.provider_service_id || '', s.active ? 1 : 0, id),
  deleteService: (id) => db.prepare('DELETE FROM services WHERE id = ?').run(id),
  // orders
  createOrder: (o) => db.prepare('INSERT INTO orders (user_id, service_id, link, quantity, charge, status, provider_order_id) VALUES (?,?,?,?,?,?,?)')
    .run(o.user_id, o.service_id, o.link, o.quantity, o.charge, o.status || 'pending', o.provider_order_id || '').lastInsertRowid,
  getOrder: (id) => db.prepare('SELECT o.*, s.name AS service_name, s.platform FROM orders o JOIN services s ON s.id = o.service_id WHERE o.id = ?').get(id),
  listOrdersByUser: (userId) => db.prepare('SELECT o.*, s.name AS service_name, s.platform FROM orders o JOIN services s ON s.id = o.service_id WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 100').all(userId),
  listAllOrders: (status) => db.prepare(`SELECT o.*, s.name AS service_name, u.name AS user_name, u.whatsapp FROM orders o JOIN services s ON s.id = o.service_id JOIN users u ON u.id = o.user_id ${status ? 'WHERE o.status = ?' : ''} ORDER BY o.id DESC LIMIT 200`).all(...(status ? [status] : [])),
  updateOrderStatus: (id, status, remains) => db.prepare('UPDATE orders SET status = ?, remains = COALESCE(?, remains) WHERE id = ?').run(status, remains ?? null, id),
  setProviderOrderId: (id, pid) => db.prepare('UPDATE orders SET provider_order_id = ? WHERE id = ?').run(pid, id),
  // deposits
  createDeposit: (userId, method, amount, tid) =>
    db.prepare('INSERT INTO deposits (user_id, method, amount, transaction_id) VALUES (?,?,?,?)').run(userId, method, amount, tid).lastInsertRowid,
  listDepositsByUser: (userId) => db.prepare('SELECT * FROM deposits WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(userId),
  listDeposits: (status) => db.prepare(`SELECT d.*, u.name AS user_name, u.whatsapp FROM deposits d JOIN users u ON u.id = d.user_id ${status ? 'WHERE d.status = ?' : ''} ORDER BY d.id DESC LIMIT 200`).all(...(status ? [status] : [])),
  updateDepositStatus: (id, status) => db.prepare('UPDATE deposits SET status = ? WHERE id = ?').run(status, id),
  getDeposit: (id) => db.prepare('SELECT * FROM deposits WHERE id = ?').get(id),
};
