// pages/api/fileai-webhook/index.ts
// Minimal FileAI webhook receiver — logs the raw payload so we can discover its shape.
// No batching / Supabase / UiPath triggering yet.
import type { NextApiRequest, NextApiResponse } from "next";
import getRawBody from "raw-body";

export const config = {
  api: {
    bodyParser: false, // read raw body ourselves so invalid JSON can still be logged
  },
};

const LOG_PREFIX = "[FileAI Webhook]";
const MAX_RAW_LOG_CHARS = 10_000;

// Headers whose values must never be logged.
const REDACTED_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-vercel-oidc-token",
  "x-vercel-sc-headers", // embeds a Vercel-internal Bearer JWT
  "x-vercel-proxy-signature",
  "forwarded", // carries the proxy signature in its sig= part
]);

function sanitizeHeaders(headers: NextApiRequest["headers"]) {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = REDACTED_HEADERS.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }
  return out;
}

// Headers likely to identify event type / signature / request id, surfaced separately for quick scanning.
function pickInterestingHeaders(headers: NextApiRequest["headers"]) {
  const pattern = /(event|signature|sig|request-id|delivery|webhook|timestamp|idempotency|content-type|user-agent)/i;
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (pattern.test(key) && !REDACTED_HEADERS.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    console.log(`${LOG_PREFIX} Received event`, {
      method: req.method,
      url: req.url,
      receivedAt: new Date().toISOString(),
    });
    console.log(`${LOG_PREFIX} Key headers:`, JSON.stringify(pickInterestingHeaders(req.headers), null, 2));
    console.log(`${LOG_PREFIX} Headers:`, JSON.stringify(sanitizeHeaders(req.headers), null, 2));

    const raw = (await getRawBody(req, { encoding: "utf-8", limit: "5mb" })) as string;

    let payload: unknown;
    try {
      payload = raw.length ? JSON.parse(raw) : {};
    } catch (parseErr: any) {
      console.error(`${LOG_PREFIX} JSON parse failed:`, parseErr?.message);
      console.error(
        `${LOG_PREFIX} Raw body (${raw.length} chars):`,
        raw.length > MAX_RAW_LOG_CHARS ? raw.slice(0, MAX_RAW_LOG_CHARS) + "...[truncated]" : raw
      );
      return res.status(400).json({ success: false, error: "Invalid JSON" });
    }

    // One searchable line per delivery (search Vercel logs by eventCode, eventId or folderId).
    const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, any>;
    const tsHeader = req.headers["x-fileai-timestamp"];
    const tsSeconds = Number(Array.isArray(tsHeader) ? tsHeader[0] : tsHeader);
    console.log(
      `${LOG_PREFIX} EVENT`,
      JSON.stringify({
        receivedAt: new Date().toISOString(),
        eventCode: p.eventCode ?? null,
        eventId: p.eventId ?? null,
        folderId: p.data?.folderId ?? null,
        fileId: p.data?.fileId ?? null,
        occurrenceId: p.data?.occurrenceId ?? null,
        data: p.data ?? null,
        fileaiTimestamp: Number.isFinite(tsSeconds) ? new Date(tsSeconds * 1000).toISOString() : null,
        signatureVersion: req.headers["x-fileai-signature-version"] ?? null,
        correlationId: req.headers["x-correlation-id"] ?? null,
      })
    );

    console.log(`${LOG_PREFIX} Payload:`, JSON.stringify(payload, null, 2));

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      console.log(`${LOG_PREFIX} Top-level keys:`, Object.keys(payload as Record<string, unknown>));
    }

    return res.status(200).json({ success: true, received: true });
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Unexpected error:`, err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
