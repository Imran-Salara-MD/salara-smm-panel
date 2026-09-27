# Salara SMM Panel

Apni SMM services website — TikTok likes/followers/views, YouTube subscribers/views, Instagram, Facebook.

## Features
- 📋 **Public rate list** — search + platform filter ke saath
- 👤 **User accounts** — register/login, wallet balance
- 💰 **Add funds** — JazzCash / Easypaisa / Bank (admin approve karta hai)
- 🛒 **Orders** — live price calculator, status tracking
- 📲 **WhatsApp notifications** — har order par admin + customer ko update
- 👑 **Admin panel** — deposits approve, orders manage, services/rates edit, settings
- 🔌 **Provider API** — standard SMM panel API se auto-delivery

## Chalana (Local)
```bash
npm install
node index.js
# http://localhost:3000
```
Pehla register hone wala account **admin** banta hai.

## Config (Environment Variables)
| Variable | Kaam |
|---|---|
| `PORT` | Port (Heroku khud deta hai) |
| `AUTH_SECRET` | Login tokens ka secret — zaroor badlein |
| `SMM_PROVIDER_URL` | SMM provider API URL (auto-delivery ke liye) |
| `SMM_API_KEY` | Provider API key |
| `WHATSAPP_TOKEN` | WhatsApp Cloud API token (notifications) |
| `PHONE_NUMBER_ID` | WhatsApp Cloud API phone number ID |
| `DB_FILE` | Database file ka path (default: `data/panel.db`) |

## Heroku Deploy
1. GitHub repo banayein, ye files push karein
2. Heroku → New App → GitHub connect → Deploy
3. Config Vars mein `AUTH_SECRET` set karein
4. Admin → Settings mein apne JazzCash/Easypaisa numbers dal dein

> **Note:** Heroku ka filesystem ephemeral hai — dyno restart par SQLite data reset ho sakta hai. Serious production ke liye Postgres use karein.

## Provider API
Standard SMM panel v2 API: `action=services | add | status | balance` with `key`.
Bina provider key ke orders **pending** rehte hain — admin manually complete kar sakta hai.
