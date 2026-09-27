// SMM Provider API client — standard SMM panel v2 API (key + action)
// Env: SMM_PROVIDER_URL, SMM_API_KEY
const URL = process.env.SMM_PROVIDER_URL || '';
const KEY = process.env.SMM_API_KEY || '';

function isConfigured() { return !!(URL && KEY); }

async function callApi(params) {
  if (!isConfigured()) throw new Error('Provider API configure nahi hai');
  const body = new URLSearchParams({ key: KEY, ...params });
  const res = await fetch(URL, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Provider se ghalat jawab mila'); }
  if (data.error) throw new Error('Provider error: ' + data.error);
  return data;
}

module.exports = {
  isConfigured,
  getServices: () => callApi({ action: 'services' }),
  placeOrder: (service, link, quantity) => callApi({ action: 'add', service, link, quantity }),
  getStatus: (order) => callApi({ action: 'status', order }),
  getBalance: () => callApi({ action: 'balance' }),
};
