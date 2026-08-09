import { BrainDoc, SearchResult } from "./types";

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "did", "do", "does",
  "and", "or", "of", "to", "in", "on", "for", "with", "my", "me", "i",
  "what", "who", "when", "where", "how", "have", "has", "had", "send",
  "ever", "including", "her", "his", "she", "he", "it", "that", "this",
  "including", "status", "each",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Words that look like proper nouns in the ORIGINAL (non-lowercased) query. */
function properNouns(query: string): string[] {
  return (query.match(/\b[A-Z][a-zA-Z]{2,}\b/g) || []).filter(
    (w) => !STOPWORDS.has(w.toLowerCase())
  );
}

function normalizeFilename(name: string): string {
  return name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreDoc(doc: BrainDoc, terms: string[], priorityTerms: string[]): number {
  const haystack = `${doc.title} ${doc.snippet} ${doc.body} ${(doc.participants || []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (haystack.includes(t)) score += 1;
  }
  for (const t of priorityTerms) {
    if (haystack.includes(t.toLowerCase())) score += 3; // proper nouns / names weigh more
  }
  return score;
}

export interface RetrievalOptions {
  perSourceLimit?: number;
}

/**
 * Core retrieval: score all docs against the query, take top-K per source,
 * then run a cross-source correlation pass so Tier-2 questions (which need
 * BOTH Gmail and Drive evidence) actually get both.
 */
export function retrieve(
  docs: BrainDoc[],
  query: string,
  opts: RetrievalOptions = {}
): SearchResult[] {
  const perSourceLimit = opts.perSourceLimit ?? 6;
  const terms = tokenize(query);
  const priority = properNouns(query);

  const scored = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, terms, priority), reason: "keyword match" }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  const gmailTop = scored.filter((r) => r.doc.source === "gmail").slice(0, perSourceLimit);
  const driveTop = scored.filter((r) => r.doc.source === "drive").slice(0, perSourceLimit);

  const merged = new Map<string, SearchResult>();
  [...gmailTop, ...driveTop].forEach((r) => merged.set(r.doc.id, r));

  // --- Cross-source correlation pass (SPEC section 5) ---
  const gmailDocs = docs.filter((d) => d.source === "gmail");
  const driveDocs = docs.filter((d) => d.source === "drive");

  // (a) Filename correlation: for every gmail doc we matched (or that
  // mentions an attachment), look for a Drive file with a similar
  // normalized name, and pull it in even if it didn't score on keywords.
  for (const gr of [...merged.values()].filter((r) => r.doc.source === "gmail")) {
    const attachmentNames: string[] = gr.doc.meta.attachments || [];
    const subjectWords = normalizeFilename(gr.doc.title);
    for (const dd of driveDocs) {
      const normDriveName = normalizeFilename(dd.title);
      const attachmentHit = attachmentNames.some(
        (a) => normalizeFilename(a) === normDriveName || normalizeFilename(a).includes(normDriveName)
      );
      const subjectHit =
        normDriveName.length > 3 && subjectWords.includes(normDriveName);
      if ((attachmentHit || subjectHit) && !merged.has(dd.id)) {
        merged.set(dd.id, {
          doc: dd,
          score: 2,
          reason: `filename correlates with Gmail message "${gr.doc.title}"`,
        });
      }
    }
  }

  // (b) Person correlation: if the query names a person, pull in every
  // Gmail doc where that name appears in participants, and any Drive file
  // owned by / last modified by that same person.
  for (const name of priority) {
    const lname = name.toLowerCase();
    for (const gd of gmailDocs) {
      const inParticipants = (gd.participants || []).some((p) => p.toLowerCase().includes(lname));
      if (inParticipants && !merged.has(gd.id)) {
        merged.set(gd.id, { doc: gd, score: 2, reason: `participant matches "${name}"` });
      }
    }
    for (const dd of driveDocs) {
      const inParticipants = (dd.participants || []).some((p) => p.toLowerCase().includes(lname));
      if (inParticipants && !merged.has(dd.id)) {
        merged.set(dd.id, { doc: dd, score: 2, reason: `Drive collaborator matches "${name}"` });
      }
    }
  }

  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}
