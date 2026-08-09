# Personal Brain — Specification (v1)

Status: written before implementation (SDD). Any deviation during build is
noted in `CHANGELOG.md` with a reason, so the final code stays traceable
back to this doc.

## 1. Problem statement

Build a conversational agent that answers natural-language questions by
pulling facts from at least two of the user's own connected tools and
reasoning across them in a single answer — not a search-result dump.

## 2. Scope

**Connectors (v1):** Gmail, Google Drive (both via OAuth2, read-only scopes,
user's own Google account).

**Non-goals (v1):**
- No vector embeddings / semantic search — v1 uses keyword + metadata
  heuristics. Documented as a clearly-labeled upgrade path in README, not
  silently skipped.
- No multi-user auth, no team features.
- Slack/Notion are not built in v1, but the connector interface
  (`Connector.sync()` / `Connector.search()`) is designed so a third
  connector can be added without touching retrieval or reasoning code.
- No hosted persistent DB required for local dev — local JSON store for
  that case. For serverless deploys (Vercel), swapped in Upstash Redis
  behind the same interface (`src/lib/store.ts`) once it became clear the
  local-file approach breaks on a read-only serverless filesystem; see
  CHANGELOG.md.

## 3. Architecture

```
 Chat UI (Next.js)
        │  user question
        ▼
 /api/chat  ──────────────────────────────────────────────┐
        │                                                  │
        ▼                                                  │
 Retrieval layer (src/lib/retrieval.ts)                    │
   - tokenize query, strip stopwords                       │
   - pull candidate docs from BOTH connectors               │
   - cross-source correlation pass (see §6)                │
        │  top-K docs, each tagged {source, title, date, url}
        ▼                                                  │
 Reasoning layer (src/lib/reasoning.ts)                     │
   - builds a grounding prompt: "Answer ONLY from the       │
     documents below. Cite each claim as [Gmail: ...] or    │
     [Drive: ...]. If the docs don't support an answer,     │
     say you don't know."                                   │
   - calls Gemini (gemini-2.5-flash) via Google Generative AI API      │
        │  conversational answer + citations                │
        ▼                                                  │
 Chat UI renders answer + source chips ─────────────────────┘
```

Ingestion (`/api/sync`) is a separate step from query-time. On sync, we
pull raw Gmail messages + Drive file metadata/text, normalize into one
schema, and write to the local store. Query-time never calls the Google
APIs directly — it only reads the normalized store. This keeps the chat
path fast and makes retrieval logic testable without live API calls.

## 4. Data model

Every connector normalizes into one shape (`src/lib/types.ts`):

```ts
interface BrainDoc {
  id: string;                 // "gmail:<messageId>" | "drive:<fileId>"
  source: "gmail" | "drive";
  title: string;              // subject line | file name
  snippet: string;            // short preview
  body: string;               // full text (email body / extracted doc text)
  participants?: string[];    // from/to/cc for gmail
  date: string;               // ISO timestamp
  url: string;                // gmail deep link | drive webViewLink
  meta: Record<string, any>;  // threadId, labelIds, mimeType, attachments, etc.
}
```

## 5. Retrieval strategy (v1, keyword + heuristic)

1. Extract keywords from the user query (lowercase, strip stopwords,
   keep proper nouns / capitalized words as high-priority terms).
2. Score every `BrainDoc` in the store by term overlap across
   title/snippet/body/participants (simple TF match, no embeddings).
3. Take top-K per source (K=6 default).
4. **Cross-source correlation pass** — this is what makes Tier 2 work:
   - *Filename match:* if a Gmail doc mentions an attachment name, or the
     query implies "my submission/draft/resume", look for Drive files
     whose name is a fuzzy match (normalized, punctuation/case-insensitive)
     to words in the email subject/body.
   - *Person match:* if the query names a person (e.g. "Priya"), filter
     Gmail docs where that name appears in `participants`, then check
     whether any matched thread also has a Drive file shared with /
     mentioning the same person.
   - *Company/thread match:* for job-application queries, cluster Gmail
     threads by sender domain / company name found in subject, and merge
     with any Drive file whose name contains that company or "resume" /
     "cover letter" / "application".
5. Return the merged candidate set with provenance tags intact — the
   reasoning layer is never allowed to blend sources without keeping each
   claim's citation.

## 6. Example queries → flow

| Query | Sources touched | Correlation logic |
|---|---|---|
| "What's on my calendar tomorrow?" | *(out of scope in v1 — no Calendar connector; brain should say so rather than guess)* | n/a |
| "Find the email from Stripe about the failed payment" | Gmail only | keyword match on sender + "failed payment" |
| "List my unread Slack DMs this week" | *(out of scope — no Slack connector in v1; brain says so)* | n/a |
| "What jobs have I applied to, and what's my status, including my take-home submission?" | Gmail + Drive | cluster Gmail threads by company/sender, extract latest status per thread, match Drive files named like `<company>-takehome` / `resume` / `application` |
| "Did I ever send Priya the contract draft, and did she reply?" | Gmail + Drive | filter Gmail by participant "Priya", find message with attachment named like "contract", check Drive for a matching file, check thread for a reply from Priya after that date |

Because Calendar/Slack aren't built in v1, the agent must say "I don't have
that connector wired up" rather than fabricate an answer — this is a
correctness requirement, not a bug.

## 7. Reasoning / prompt contract

System prompt (paraphrased, see `src/lib/reasoning.ts` for exact text):
- Only answer using the `BrainDoc` context provided in this turn.
- Every factual claim must carry a citation to a specific doc.
- If context is insufficient, say so explicitly — never guess.
- Keep the answer conversational, not a bullet dump of raw docs.

## 8. Auth & secrets

- Google OAuth2 (Authorization Code flow), scopes:
  `gmail.readonly`, `drive.readonly`, `drive.metadata.readonly`.
- Tokens stored via the same store interface as documents: locally in
  `data/tokens.json` (gitignored, never committed); in production, in
  Upstash Redis (see §2, CHANGELOG.md).
- `.env.example` documents required vars; `.env` is gitignored.
- No secrets are ever sent to the LLM — only document content the user
  already owns.

## 9. UI

Single-page chat interface (`/`) — message list + input box + a "Sync
now" button that hits `/api/sync`. Each assistant answer shows small
source chips (source icon + title) the user can click to open the
original Gmail/Drive item.

## 10. Build milestones (traceability)

- M0 — this spec
- M1 — Google OAuth flow + token storage
- M2 — Gmail connector (`sync`, normalize, store)
- M3 — Drive connector (`sync`, normalize, store)
- M4 — retrieval layer incl. cross-source correlation
- M5 — reasoning layer (Gemini API call, citation-constrained prompt)
- M6 — chat UI
- M7 — manual verification against §6 example queries
- M8 — README with setup steps + demo recording

Deviations from this spec during implementation will be logged in
`CHANGELOG.md`.
