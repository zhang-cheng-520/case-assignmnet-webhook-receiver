# Case Assignment – FileAI Webhook Receiver

Minimal Next.js project whose only purpose (for now) is to receive FileAI webhook
payloads and log them to Vercel Runtime Logs so the real payload shape can be inspected.

## Endpoint

`POST /api/fileai-webhook`

| Case            | Status | Body                                   |
| --------------- | ------ | -------------------------------------- |
| Valid JSON      | 200    | `{"success":true,"received":true}`     |
| Invalid JSON    | 400    | `{"success":false,"error":"Invalid JSON"}` |
| Non-POST        | 405    | `{"success":false,"error":"Method not allowed"}` |
| Unexpected error| 500    | `{"success":false,"error":"Internal server error"}` |

Logs are prefixed with `[FileAI Webhook]`. Authorization / cookie / API-key headers are redacted.

No environment variables required.

## Local

```bash
npm install
npm run dev
```
