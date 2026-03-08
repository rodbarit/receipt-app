# Receipt Scanner

Upload photos of receipts → get a CSV with issuer, date, total, and item descriptions.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Vercel Serverless Function (`/api/extract.js`)
- **AI:** Claude claude-sonnet-4-20250514 (vision)
- **Rate limiting:** Vercel KV (Redis) — 10 receipts/day per IP

---

## Deploy to Vercel (Step-by-Step)

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create receipt-scanner --public --push
# or: git remote add origin https://github.com/YOUR_USERNAME/receipt-scanner.git && git push -u origin main
```

### 2. Create a Vercel KV Database

1. Go to [vercel.com](https://vercel.com) → your project → **Storage** tab
2. Click **Create Database** → choose **KV (Redis)**
3. Name it `receipt-ratelimit` → Create
4. Vercel will auto-inject `KV_REST_API_URL` and `KV_REST_API_TOKEN` into your project env vars

### 3. Import Project to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Framework preset: **Vite** (auto-detected)
4. Add Environment Variables:
   - `ANTHROPIC_API_KEY` → your key from [console.anthropic.com](https://console.anthropic.com)
   - `KV_REST_API_URL` → from your KV database (auto-added if you linked it)
   - `KV_REST_API_TOKEN` → from your KV database (auto-added if you linked it)
5. Click **Deploy**

### 4. Done ✓

Your app will be live at `https://receipt-scanner-YOUR_NAME.vercel.app`

---

## Local Development

```bash
npm install
cp .env.example .env.local
# Fill in your keys in .env.local

npm run dev
# App runs at http://localhost:5173
# API runs via Vite proxy → you'll need vercel dev for full API testing
```

For full local API testing (including the serverless function):
```bash
npm install -g vercel
vercel dev
```

---

## Project Structure

```
receipt-scanner/
├── api/
│   └── extract.js        # Serverless function — AI extraction + rate limiting
├── src/
│   ├── main.jsx          # React entry point
│   └── App.jsx           # Main UI component
├── index.html
├── vite.config.js
├── vercel.json           # Vercel routing config
├── .env.example          # Environment variable template
└── package.json
```

---

## Rate Limiting

- 10 receipt extractions per IP address per day
- Resets at midnight UTC
- Powered by Vercel KV (Redis)
- Rate limit errors are shown in the UI

## Adjusting the Limit

In `api/extract.js`, change:
```js
const DAILY_LIMIT = 10;
```
