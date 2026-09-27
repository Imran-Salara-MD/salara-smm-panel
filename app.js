/* Salara SMM Panel — shared frontend helpers */
var TOKEN_KEY = 'smm_token';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('smm_admin');
  localStorage.removeItem('smm_name');
}
function isAdminFlag() { return localStorage.getItem('smm_admin') === '1'; }

/* Same-origin JSON API with Bearer auth. Throws Error with Roman-Urdu-friendly message. */
async function api(path, method, body) {
  method = method || 'GET';
  var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  var t = getToken();
  if (t) opts.headers['Authorization'] = 'Bearer ' + t;
  if (body !== undefined) opts.body = JSON.stringify(body);
  var res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new Error('Internet connection ka masla lagta hai. Dobara try karein.');
  }
  var data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) throw new Error((data && data.error) || ('Server error (' + res.status + '). Dobara try karein.'));
  if (data && data.ok === false) throw new Error(data.error || 'Request fail ho gayi. Dobara try karein.');
  return data;
}

/* PKR formatting: 1250.5 -> "Rs 1,250.50" */
function fmt(n) {
  var v = Number(n);
  if (isNaN(v)) return 'Rs 0.00';
  return 'Rs ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return String(s); }
}

function shortLink(link, n) {
  n = n || 34;
  var s = String(link || '');
  return esc(s.length > n ? s.slice(0, n) + '…' : s);
}

/* Status -> badge HTML */
function statusBadge(s) {
  var key = String(s || '').toLowerCase();
  var map = {
    pending:     ['b-pending',  '⏳ Pending'],
    in_progress: ['b-progress', '🔄 In Progress'],
    completed:   ['b-done',     '✅ Completed'],
    partial:     ['b-partial',  '⚠️ Partial'],
    cancelled:   ['b-cancel',   '❌ Cancelled'],
    approved:    ['b-done',     '✅ Approved'],
    rejected:    ['b-cancel',   '❌ Rejected'],
    active:      ['b-done',     '✅ Active'],
    inactive:    ['b-cancel',   '⛔ Inactive']
  };
  var m = map[key] || ['b-pending', esc(s || '—')];
  return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
}

/* Redirects to auth.html if not logged in (or not admin when adminOnly). Returns user or null. */
async function requireLogin(adminOnly) {
  if (!getToken()) { location.href = 'auth.html'; return null; }
  try {
    var d = await api('/api/me');
    if (!d.ok || !d.user) throw new Error('bad');
    if (adminOnly && !d.user.is_admin) { location.href = 'dashboard.html'; return null; }
    return d.user;
  } catch (e) {
    clearToken();
    location.href = 'auth.html';
    return null;
  }
}

function logout() { clearToken(); location.href = 'index.html'; }

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
  } catch (e) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e2) {}
    ta.remove();
  }
  toast('Copy ho gaya ✓');
}

function toast(msg, isErr) {
  var box = document.getElementById('toast-box');
  if (!box) { box = document.createElement('div'); box.id = 'toast-box'; document.body.appendChild(box); }
  var el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' toast-err' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(function () { el.classList.add('show'); }, 10);
  setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); }, 3500);
}

/* Show/hide an inline error box by id */
function setErr(id, msg) {
  var el = document.getElementById(id);
  if (!el) { if (msg) toast(msg, true); return; }
  el.style.display = msg ? 'block' : 'none';
  el.textContent = msg || '';
}

/* Tab switching helper: buttons have data-tab, panels have id 'tab-<name>' */
function initTabs(btnSelector, onSwitch) {
  var btns = document.querySelectorAll(btnSelector);
  function activate(name) {
    btns.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'tab-' + name);
    });
    if (onSwitch) onSwitch(name);
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { activate(b.dataset.tab); }); });
  return activate;
}
