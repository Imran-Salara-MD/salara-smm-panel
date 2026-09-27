// Simple stateless auth — HMAC signed tokens (koi extra package nahi)
const crypto = require('crypto');

const SECRET = process.env.AUTH_SECRET || 'salara-smm-panel-secret-change-me';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}
function signToken(userId) {
  const body = Buffer.from(JSON.stringify({ id: userId, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [body, sig] = String(token).split('.');
    const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    // 30 din valid
    if (Date.now() - data.t > 30 * 24 * 3600 * 1000) return null;
    return data.id;
  } catch { return null; }
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken };
