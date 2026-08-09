import { google } from "googleapis";
import { getOAuthClient } from "./google";
import { BrainDoc } from "./types";

const EXTRACTABLE_TEXT_TYPES = new Set([
  "application/vnd.google-apps.document",
  "text/plain",
]);

/**
 * Pull recent Drive files (metadata always; body text only for Google Docs
 * and plain text files, to keep the demo fast and avoid heavy binary
 * parsing). Other types (PDF, docx, xlsx, images) are still indexed by
 * filename, which is enough for the filename-correlation heuristics in
 * SPEC §5.
 */
export async function syncDrive(pageSize = 100): Promise<BrainDoc[]> {
  const auth = await getOAuthClient();
  const drive = google.drive({ version: "v3", auth });

  const list = await drive.files.list({
    pageSize,
    orderBy: "modifiedTime desc",
    fields:
      "files(id, name, mimeType, modifiedTime, webViewLink, owners, lastModifyingUser, description)",
  });

  const files = list.data.files || [];
  const docs: BrainDoc[] = [];

  for (const f of files) {
    if (!f.id || !f.name) continue;

    let body = f.description || "";
    if (EXTRACTABLE_TEXT_TYPES.has(f.mimeType || "")) {
      try {
        const exported = await drive.files.export(
          { fileId: f.id, mimeType: "text/plain" },
          { responseType: "text" }
        );
        body = String(exported.data).slice(0, 8000);
      } catch {
        // export can fail for non-Docs files; filename-only indexing still works
      }
    }

    docs.push({
      id: `drive:${f.id}`,
      source: "drive",
      title: f.name,
      snippet: body.slice(0, 300) || f.name,
      body,
      participants: [
        ...(f.owners || []).map((o) => o.emailAddress || o.displayName || ""),
        f.lastModifyingUser?.emailAddress || "",
      ].filter(Boolean) as string[],
      date: f.modifiedTime ? new Date(f.modifiedTime).toISOString() : new Date().toISOString(),
      url: f.webViewLink || "",
      meta: { mimeType: f.mimeType },
    });
  }

  return docs;
}
