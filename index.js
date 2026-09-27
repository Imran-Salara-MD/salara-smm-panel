// Salara SMM Panel — Express server
const express = require('express');
const path = require('path');
const store = require('./db');
const auth = require('./auth');
const provider = require('./provider');
const wa = require('./whatsapp');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_WA = () => store.getSetting('support_whatsapp', '923046123264');
const PANEL = () => store.getSetting('panel_name', 'Salara SMM Panel');

// ---------- helpers ----------
function authUser(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const id = auth.verifyToken(token);
  if (!id) return res.status(401).json({ ok: false, error: 'Login required' });
  const user = store.getUserById(id);
  if (!user) return res.status(401).json({ ok: false, error: 'User nahi mila' });
  req.user = user;
  next();
}
function adminOnly(req, res, next) {
  if (!req.user.is_admin) return res.status(403).json({ ok: false, error: 'Admin only' });
  next();
}
const cleanNum = (s) => String(s || '').replace(/\D/g, '');

// ---------- public ----------
app.get('/api/services', (req, res) => {
  res.json({ ok: true, services: store.listServices(true), panel: PANEL(), currency: store.getSetting('currency', 'PKR') });
});
app.get('/api/settings/public', (req, res) => {
  res.json({
    ok: true, panel: PANEL(),
    jazzcash_number: store.getSetting('jazzcash_number'),
    jazzcash_name: store.getSetting('jazzcash_name'),
    easypaisa_number: store.getSetting('easypaisa_number'),
    easypaisa_name: store.getSetting('easypaisa_name'),
    bank_detail: store.getSetting('bank_detail'),
    support_whatsapp: ADMIN_WA(),
  });
});

// ---------- auth ----------
app.post('/api/register', (req, res) => {
  const { name, whatsapp, password } = req.body || {};
  const waNum = cleanNum(whatsapp);
  if (!name || waNum.length < 10 || !password || password.length < 4)
    return res.json({ ok: false, error: 'Naam, WhatsApp number aur password (min 4) zaroori hai' });
  if (store.getUserByWhatsapp(waNum))
    return res.json({ ok: false, error: 'Is number se account pehle se hai — login karein' });
  const isAdmin = store.countUsers() === 0; // pehla user = admin
  const id = store.createUser(name.trim(), waNum, auth.hashPassword(password), isAdmin);
  res.json({ ok: true, token: auth.signToken(id), isAdmin });
});
app.post('/api/login', (req, res) => {
  const { whatsapp, password } = req.body || {};
  const user = store.getUserByWhatsapp(cleanNum(whatsapp));
  if (!user || !auth.verifyPassword(password || '', user.password_hash))
    return res.json({ ok: false, error: 'Number ya password ghalat hai' });
  res.json({ ok: true, token: auth.signToken(user.id), isAdmin: !!user.is_admin, name: user.name });
});

// ---------- user ----------
app.get('/api/me', authUser, (req, res) => {
  const { id, name, whatsapp, balance, is_admin } = req.user;
  res.json({ ok: true, user: { id, name, whatsapp, balance, is_admin: !!is_admin } });
});
app.post('/api/deposit', authUser, (req, res) => {
  const { method, amount, transaction_id } = req.body || {};
  const amt = Number(amount);
  if (!['jazzcash', 'easypaisa', 'bank'].includes(method)) return res.json({ ok: false, error: 'Method ghalat hai' });
  if (!amt || amt < 50) return res.json({ ok: false, error: 'Minimum deposit 50 PKR hai' });
  if (!transaction_id || String(transaction_id).trim().length < 3) return res.json({ ok: false, error: 'Transaction ID likhein' });
  const id = store.createDeposit(req.user.id, method, amt, String(transaction_id).trim());
  wa.notify(ADMIN_WA(), `💰 *New Deposit*\n👤 ${req.user.name} (${req.user.whatsapp})\n💵 ${amt} PKR via ${method}\n🧾 TID: ${transaction_id}\nApprove karein: Admin Panel → Deposits`);
  res.json({ ok: true, id, msg: 'Deposit request bhej di gayi. Admin approve karega to balance add ho jayega.' });
});
app.get('/api/deposits', authUser, (req, res) => {
  res.json({ ok: true, deposits: store.listDepositsByUser(req.user.id) });
});
app.post('/api/order', authUser, (req, res) => {
  const { service_id, link, quantity } = req.body || {};
  const svc = store.getService(Number(service_id));
  if (!svc || !svc.active) return res.json({ ok: false, error: 'Service nahi mili' });
  const qty = Math.floor(Number(quantity));
  if (!qty || qty < svc.min_qty || qty > svc.max_qty)
    return res.json({ ok: false, error: `Quantity ${svc.min_qty} se ${svc.max_qty} tak ho sakti hai` });
  if (!link || !/^https?:\/\//i.test(link)) return res.json({ ok: false, error: 'Sahi link dein (https://...)' });
  const charge = Math.round((svc.rate_per_1000 * qty / 1000) * 100) / 100;
  if (!store.deductBalance(req.user.id, charge))
    return res.json({ ok: false, error: `Balance kam hai. Zaroorat: ${charge} PKR` });

  const orderId = store.createOrder({ user_id: req.user.id, service_id: svc.id, link, quantity: qty, charge });

  // provider ko bhejo (agar configured aur service linked hai)
  (async () => {
    try {
      if (provider.isConfigured() && svc.provider_service_id) {
        const r = await provider.placeOrder(svc.provider_service_id, link, qty);
        if (r.order) {
          store.setProviderOrderId(orderId, String(r.order));
          store.updateOrderStatus(orderId, 'in_progress');
        }
      }
    } catch (e) { console.error('provider order failed:', e.message); }
    wa.notify(ADMIN_WA(), `🛒 *New Order #${orderId}*\n👤 ${req.user.name}\n📌 ${svc.platform} — ${svc.name}\n🔗 ${link}\n🔢 Qty: ${qty}\n💵 Charge: ${charge} PKR`);
    wa.notify(req.user.whatsapp, `✅ *Order #${orderId} receive ho gaya!*\n📌 ${svc.name}\n🔢 Quantity: ${qty}\n💵 Charge: ${charge} PKR\nStatus: ${PANEL()} dashboard par track karein.`);
  })();

  res.json({ ok: true, id: orderId, charge, msg: `Order #${orderId} lag gaya! Charge: ${charge} PKR` });
});
app.get('/api/orders', authUser, (req, res) => {
  res.json({ ok: true, orders: store.listOrdersByUser(req.user.id) });
});

// ---------- admin ----------
app.get('/api/admin/deposits', authUser, adminOnly, (req, res) => {
  res.json({ ok: true, deposits: store.listDeposits(req.query.status || '') });
});
app.post('/api/admin/deposit/:id', authUser, adminOnly, (req, res) => {
  const dep = store.getDeposit(Number(req.params.id));
  if (!dep || dep.status !== 'pending') return res.json({ ok: false, error: 'Deposit nahi mili' });
  const action = req.body.action;
  if (action === 'approve') {
    store.updateDepositStatus(dep.id, 'approved');
    store.addBalance(dep.user_id, dep.amount);
    const u = store.getUserById(dep.user_id);
    wa.notify(u.whatsapp, `💰 *Payment approve ho gaya!*\n💵 ${dep.amount} PKR aapke ${PANEL()} balance mein add kar diye gaye hain.`);
    res.json({ ok: true, msg: 'Approve kar diya, balance add ho gaya' });
  } else if (action === 'reject') {
    store.updateDepositStatus(dep.id, 'rejected');
    res.json({ ok: true, msg: 'Reject kar diya' });
  } else res.json({ ok: false, error: 'action: approve ya reject' });
});
app.get('/api/admin/orders', authUser, adminOnly, (req, res) => {
  res.json({ ok: true, orders: store.listAllOrders(req.query.status || ''), provider: provider.isConfigured() });
});
app.post('/api/admin/order/:id/status', authUser, adminOnly, (req, res) => {
  const order = store.getOrder(Number(req.params.id));
  if (!order) return res.json({ ok: false, error: 'Order nahi mila' });
  const status = req.body.status;
  if (!['pending', 'in_progress', 'completed', 'partial', 'cancelled'].includes(status))
    return res.json({ ok: false, error: 'Ghalat status' });
  store.updateOrderStatus(order.id, status);
  const u = store.getUserById(order.user_id);
  const em = { pending: '⏳', in_progress: '🔄', completed: '✅', partial: '⚠️', cancelled: '❌' }[status];
  wa.notify(u.whatsapp, `${em} *Order #${order.id} update:* ${status}\n📌 ${order.service_name}`);
  res.json({ ok: true, msg: 'Status update ho gaya' });
});
app.post('/api/admin/order/:id/sync', authUser, adminOnly, async (req, res) => {
  const order = store.getOrder(Number(req.params.id));
  if (!order || !order.provider_order_id) return res.json({ ok: false, error: 'Provider order nahi hai' });
  try {
    const s = await provider.getStatus(order.provider_order_id);
    const map = { Completed: 'completed', Partial: 'partial', Canceled: 'cancelled', Pending: 'pending', Processing: 'in_progress', 'In progress': 'in_progress' };
    const status = map[s.status] || 'in_progress';
    store.updateOrderStatus(order.id, status, Number(s.remains) || 0);
    res.json({ ok: true, status, remains: s.remains });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});
app.get('/api/admin/services', authUser, adminOnly, (req, res) => {
  res.json({ ok: true, services: store.listServices(false) });
});
app.post('/api/admin/service', authUser, adminOnly, (req, res) => {
  const s = req.body || {};
  if (!s.platform || !s.name || !Number(s.rate_per_1000)) return res.json({ ok: false, error: 'Platform, name aur rate zaroori hai' });
  const data = {
    platform: s.platform, name: s.name, rate_per_1000: Number(s.rate_per_1000),
    min_qty: Number(s.min_qty) || 100, max_qty: Number(s.max_qty) || 100000,
    description: s.description || '', provider_service_id: s.provider_service_id || '',
    active: s.active === false ? false : true,
  };
  if (s.id) { store.updateService(Number(s.id), data); res.json({ ok: true, msg: 'Service update ho gayi' }); }
  else { const id = store.createService(data); res.json({ ok: true, id, msg: 'Service add ho gayi' }); }
});
app.delete('/api/admin/service/:id', authUser, adminOnly, (req, res) => {
  store.deleteService(Number(req.params.id));
  res.json({ ok: true, msg: 'Service delete ho gayi' });
});
app.get('/api/admin/settings', authUser, adminOnly, (req, res) => {
  const keys = ['panel_name', 'currency', 'jazzcash_number', 'jazzcash_name', 'easypaisa_number', 'easypaisa_name', 'bank_detail', 'support_whatsapp'];
  const out = {}; for (const k of keys) out[k] = store.getSetting(k);
  res.json({ ok: true, settings: out, provider: provider.isConfigured(), whatsapp: wa.isConfigured() });
});
app.post('/api/admin/settings', authUser, adminOnly, (req, res) => {
  for (const [k, v] of Object.entries(req.body || {})) store.setSetting(k, v);
  res.json({ ok: true, msg: 'Settings save ho gayin' });
});
app.post('/api/admin/sync-services', authUser, adminOnly, async (req, res) => {
  try {
    const list = await provider.getServices();
    res.json({ ok: true, count: Array.isArray(list) ? list.length : 0, services: (Array.isArray(list) ? list : []).slice(0, 50), msg: 'Provider se services mil gayin — neeche se provider_service_id copy karke apni service mein lagayein' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});
app.get('/api/admin/provider-balance', authUser, adminOnly, async (req, res) => {
  try { res.json({ ok: true, ...(await provider.getBalance()) }); }
  catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get('/health', (req, res) => res.json({ ok: true, panel: PANEL() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`${PANEL()} live on port ${PORT}`));
