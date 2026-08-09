import { google } from "googleapis";
import { getOAuthClient } from "./google";
import { BrainDoc } from "./types";

function decodeBody(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf-8");
  }
  if (payload.parts) {
    // prefer text/plain, fall back to text/html stripped of tags
    const plain = payload.parts.find((p: any) => p.mimeType === "text/plain");
    if (plain) return decodeBody(plain);
    const html = payload.parts.find((p: any) => p.mimeType === "text/html");
    if (html) {
      return decodeBody(html).replace(/<[^>]+>/g, " ");
    }
    // nested multipart
    for (const p of payload.parts) {
      const nested = decodeBody(p);
      if (nested) return nested;
    }
  }
  return "";
}

function header(headers: any[], name: string) {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

/**
 * Pull the most recent N messages (default 150) across the inbox + sent,
 * normalize into BrainDoc[]. Attachment filenames are captured in meta so
 * the retrieval layer can correlate them against Drive files (SPEC §5).
 */
export async function syncGmail(maxResults = 60): Promise<BrainDoc[]> {
  const auth = await getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });

  const list = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    q: "in:anywhere -in:chats",
  });

  const messages = list.data.messages || [];

  // Fetch message details in parallel batches instead of one-at-a-time —
  // sequential awaits here were the main cause of slow syncs (each Gmail
  // API call has real network latency, and 150 of them in series adds up
  // to minutes, which exceeds serverless function time limits).
  const BATCH_SIZE = 10;
  const docs: BrainDoc[] = [];
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (m) => {
        if (!m.id) return null;
        const full = await gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "full",
        });
        return normalizeMessage(full.data);
      })
    );
    for (const doc of batchResults) if (doc) docs.push(doc);
  }

  return docs;
}

function normalizeMessage(msg: any): BrainDoc {
  const headers = msg.payload?.headers || [];
  const subject = header(headers, "Subject") || "(no subject)";
  const from = header(headers, "From");
  const to = header(headers, "To");
  const dateHeader = header(headers, "Date");
  const body = decodeBody(msg.payload).slice(0, 8000);

  const attachments: string[] = [];
  const collectAttachments = (part: any) => {
    if (!part) return;
    if (part.filename) attachments.push(part.filename);
    if (part.parts) part.parts.forEach(collectAttachments);
  };
  collectAttachments(msg.payload);

  return {
    id: `gmail:${msg.id}`,
    source: "gmail",
    title: subject,
    snippet: (msg.snippet || "").slice(0, 300),
    body,
    participants: [from, to].filter(Boolean),
    date: dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString(),
    url: `https://mail.google.com/mail/u/0/#all/${msg.id}`,
    meta: {
      threadId: msg.threadId,
      labelIds: msg.labelIds || [],
      attachments,
    },
  };
}
