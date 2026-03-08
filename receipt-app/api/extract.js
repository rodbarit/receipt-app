// api/extract.js — Vercel Serverless Function
// Requires env vars: ANTHROPIC_API_KEY, KV_REST_API_URL, KV_REST_API_TOKEN

const DAILY_LIMIT = 10;

// Simple Vercel KV client using fetch (no extra package needed)
async function kvGet(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const json = await res.json();
  return json.result ?? null;
}

async function kvIncr(key) {
  const res = await fetch(`${process.env.KV_REST_API_URL}/incr/${key}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  const json = await res.json();
  return json.result;
}

async function kvExpireAt(key, unixTimestamp) {
  await fetch(`${process.env.KV_REST_API_URL}/expireat/${key}/${unixTimestamp}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
}

function getMidnightUTC() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.floor(midnight.getTime() / 1000);
}

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = getClientIP(req);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rateLimitKey = `rl:${ip}:${today}`;

  // --- Rate limit check ---
  try {
    const current = await kvGet(rateLimitKey);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= DAILY_LIMIT) {
      return res.status(429).json({
        error: `Daily limit reached. You can process up to ${DAILY_LIMIT} receipts per day. Try again tomorrow.`,
        remaining: 0
      });
    }

    // Increment and set expiry to midnight UTC
    const newCount = await kvIncr(rateLimitKey);
    if (newCount === 1) {
      await kvExpireAt(rateLimitKey, getMidnightUTC());
    }

    const remaining = DAILY_LIMIT - newCount;
    res.setHeader('X-RateLimit-Remaining', remaining);
  } catch (kvErr) {
    // If KV is unavailable, log but don't block the request
    console.error('KV rate limit error:', kvErr.message);
  }

  // --- Extract receipt data ---
  const { base64, mediaType } = req.body || {};
  if (!base64 || !mediaType) {
    return res.status(400).json({ error: 'Missing base64 or mediaType in request body' });
  }

  const prompt = `You are a receipt data extractor. Analyze this receipt image and return ONLY a JSON object (no markdown, no extra text) with these exact keys:
- "issuer": the store/restaurant/company name
- "date": the date of the receipt in YYYY-MM-DD format
- "total": the final total amount as a string with currency symbol (e.g. "$12.50")
- "description": a brief comma-separated list of the main items purchased

If a field cannot be determined, use an empty string. Return ONLY the JSON object.`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'AI extraction failed. Please try again.' });
    }

    const anthropicData = await anthropicRes.json();
    const text = (anthropicData.content || []).map(b => b.text || '').join('');

    // Parse JSON from response
    let extracted = null;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) extracted = JSON.parse(match[0]);
    } catch {}

    if (!extracted) {
      return res.status(422).json({ error: 'Could not parse receipt data from image.' });
    }

    return res.status(200).json({ data: extracted });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
