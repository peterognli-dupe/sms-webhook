// index.js
{ role: 'system', content: systemPrompt },
{ role: 'user', content: userMsg }
]
});


return completion.choices?.[0]?.message?.content?.trim() || "Thanks for your message! When is a good time for a quick call?";
}


async function sendSms({ to, text }) {
const from = process.env.TELNYX_FROM_NUMBER; // E.164, e.g., +18885551234 (toll-free) or +1435...
if (!from) throw new Error('Missing TELNYX_FROM_NUMBER');
return telnyx.messages.create({ from, to, text });
}


// --- Telnyx inbound webhook ---
app.post('/webhook', async (req, res) => {
try {
if (!verifyTelnyxSignature(req)) {
logger.warn({ msg: 'Signature verification failed' });
return res.status(400).send('Invalid signature');
}


const body = req.body || {};
const eventType = body?.data?.event_type || body?.event_type || 'unknown';
const payload = body?.data?.payload || body?.data?.record || body?.payload || body;


// Only handle inbound messages
if (!eventType.includes('message.received')) {
return res.status(200).json({ ignored: true });
}


const inboundText = payload?.text || payload?.message || '';
const from = payload?.from?.phone_number || payload?.from || '';
const to = payload?.to?.phone_number || payload?.to || '';


logger.info({ eventType, from, to, inboundText }, 'Inbound message');


// Update session state
const session = getSession(from);
session.history.push({ role: 'user', text: inboundText, at: Date.now() });


// Respect opt-out
if (/\b(stop|unsubscribe)\b/i.test(inboundText)) {
await sendSms({ to: from, text: 'Understood—you will not receive further texts. Reply HELP for help.' });
session.stage = 'stopped';
return res.status(200).json({ ok: true });
}


// Get an assistant reply
const reply = await generateBotReply({ from, text: inboundText });


// Send SMS via Telnyx
await sendSms({ to: from, text: reply });


session.history.push({ role: 'assistant', text: reply, at: Date.now() });
session.stage = 'active';


return res.status(200).json({ ok: true });
} catch (err) {
logger.error({ err }, 'Webhook handler error');
return res.status(200).json({ ok: true }); // Respond 200 so Telnyx doesn’t retry endlessly during MVP
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
logger.info(`Server listening on port ${PORT}`);
});
