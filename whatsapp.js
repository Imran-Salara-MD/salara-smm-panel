// WhatsApp notifications — official Cloud API (wahi jo Imran Salara MD Bot mein hai)
// Env: WHATSAPP_TOKEN, PHONE_NUMBER_ID
const TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_ID = process.env.PHONE_NUMBER_ID || '';

function isConfigured() { return !!(TOKEN && PHONE_ID); }

// to: digits like 923046123264
async function sendText(to, text) {
  if (!isConfigured()) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: String(to).replace(/\D/g, ''), type: 'text', text: { body: text } }),
    });
    return res.ok;
  } catch { return false; }
}
// fire-and-forget (order flow ko slow nahi karega)
function notify(to, text) {
  sendText(to, text).catch(() => {});
}

module.exports = { isConfigured, sendText, notify };
