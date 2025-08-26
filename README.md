# Telnyx Setter Bot — Minimal Server


A tiny Express service that:
- Receives inbound SMS/MMS webhooks from Telnyx at `/webhook`
- Generates a concise reply using OpenAI
- Sends the reply back via Telnyx
- Provides `/send` for manual test messages


## 1) Local Run (optional)
```bash
npm i
cp .env.example .env
# Fill in your keys and number in .env
npm start
