// index.js — Telnyx v2 + OpenAI, Render-ready
require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const pino = require('pino');
const bodyParser = require('body-parser');

// Telnyx v2 SDK
const Telnyx = require('telnyx');
const telnyx = new Telnyx(process.env.TELNYX_API_KEY);

// OpenAI SDK
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

console.log("DEBUG OPENAI present?", !!process.env.OPENAI_API_KEY);
console.log("DEBUG TELNYX present?", !!process.env.TELNYX_API_KEY);

if (!process.env.OPENAI_API_KEY?.trim()) {
  console.error("OPENAI_API_KEY missing at runtime");
  process.exit(1);
}



// --- Middleware ---
app.use(cors());
// Keep raw body for optional signature verification
app.use('/webhook', bodyParser.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.json());

// Rate limit the manual /send endpoint
const sendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, uptime: process.uptime() });
});

// --- OPTIONAL: Telnyx signature verification (disabled for MVP) ---
function verifyTelnyxSignature(req) {
  if (process.env.VERIFY_TELNYX_SIGNATURE !== 'true') return true;
  const signature = req.get('Telnyx-Signature-Ed25519');
  const timestamp = req.get('Telnyx-Timestamp');
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!signature || !timestamp || !publicKey) return false;
  // TODO: Implement ed25519 verification (tweetnacl) before enabling in prod
  return true;
}

// --- In-memory session store (swap for DB later) ---
const sessions = new Map(); // key: phone number
function getSession(key) {
  if (!sessions.has(key)) sessions.set(key, { stage: 'new', history: [] });
  return sessions.get(key);
}

async function generateBotReply({ from, text }) {
  const systemPrompt = `You are a friendly SMS appointment setter for a solar company.

Rules:
- Be concise (<= 2 short sentences).
- Be polite and helpful.
- Ask one clear question to move toward booking a call.
- If they ask to stop, acknowledge and do not message again.`;

  const userMsg = `From ${from}: ${text}`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.4,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg }
    ]
  });

  return (
    completion.choices?.[0]?.message?.content?.trim() ||
    'Thanks for your message! When is a good time for a quick call?'
  );
}

async function sendSms({ to, text }) {
  const from = process.env.TELNYX_FROM_NUMBER; // E.164, e.g., +18885551234
  if (!from) throw new Error('Missing TELNYX_FROM_NUMBER');
  return telnyx.messages.create({ from, to, text });
}

// --- Telnyx inbound webhook (fast-ack version) ---
app.post('/webhook', async (req, res) => {
  // 1) Always acknowledge immediately
  res.status(200).json({ ok: true });

  try {
    if (!verifyTelnyxSignature(req)) {
      logger.warn({ msg: 'Signature verification failed' });
      return; // we've already ack'd; just stop processing
    }

    const body = req.body || {};
    const eventType = body?.data?.event_type || body?.event_type || 'unknown';
    const payload = body?.data?.payload || body?.data?.record || body?.payload || body;

    if (!eventType.includes('message.received')) return;

    const inboundText = payload?.text || payload?.message || '';
    const from = payload?.from?.phone_number || payload?.from || '';
    const to = payload?.to?.phone_number || payload?.to || '';

    logger.info({ eventType, from, to, inboundText }, 'Inbound message');

    const session = getSession(from);
    session.history.push({ role: 'user', text: inboundText, at: Date.now() });

    // Respect opt-out
    if (/\b(stop|unsubscribe)\b/i.test(inboundText)) {
      await sendSms({ to: from, text: 'Understood—you will not receive further texts. Reply HELP for help.' });
      session.stage = 'stopped';
      return;
    }

    // (Optional) Quiet hours
    if (process.env.ENABLE_QUIET_HOURS === 'true') {
      const hour = new Date().getHours();
      if (hour < 8 || hour >= 20) return;
    }

    // 2) Do the heavy work AFTER ack
    const reply = await generateBotReply({ from, text: inboundText });
    await sendSms({ to: from, text: reply });

    session.history.push({ role: 'assistant', text: reply, at: Date.now() });
    session.stage = 'active';
  } catch (err) {
    logger.error({ err }, 'Webhook async processing error');
  }
});

// --- Manual test send ---
app.post('/send', sendLimiter, async (req, res) => {
  try {
    const { to, text } = req.body || {};
    if (!to || !text) return res.status(400).json({ error: 'Provide { to, text }' });
    const r = await sendSms({ to, text });
    return res.status(200).json({ ok: true, data: r?.data || r });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Health check endpoint for Fly.io
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Use PORT from env, default 8080
const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server listening on port ${PORT}`);
});
