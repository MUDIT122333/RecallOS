# Changelog

## v1 (initial build)

Implemented per SPEC.md milestones M0–M8. No deviations from the spec
during implementation — retrieval, reasoning, and connector behavior all
match SPEC.md sections 3–8 as written.

Explicitly declined to implement (see SPEC.md §2 for reasoning):
- Vector embeddings for retrieval (heuristic keyword search used instead).
- Slack/Notion connectors (interface left extensible; not built).
- Hosted persistent DB (local JSON store; noted as a swap-in for prod).

## v1.2

Two production-readiness fixes found while testing the live Vercel deploy:

1. **Storage migration.** The local JSON file store crashed on Vercel's
   serverless functions (read-only filesystem outside `/tmp`, and even
   `/tmp` doesn't persist between invocations). Migrated `src/lib/store.ts`
   to a dual backend: Upstash Redis when `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN` are set (production), local JSON file
   otherwise (local dev, unchanged experience, zero setup). This required
   making the store's interface async and updating every caller
   (`google.ts`, `gmail.ts`, `drive.ts`, all three API routes) to await
   it — SPEC.md §2/§8 updated accordingly. Interface shape
   (`loadDocs`/`saveDocs`/`upsertDocs`/`loadTokens`/`saveTokens`) is
   unchanged, so retrieval/reasoning/UI code needed no changes.
2. **Gmail sync speed.** `syncGmail` was fetching message details one at a
   time in a sequential loop (145s for 150 messages locally), which
   exceeds serverless function time limits. Switched to batched parallel
   fetches (10 concurrent) and lowered the default `maxResults` from 150
   to 60. Also added `export const maxDuration = 60` to the sync route to
   use the full time budget Vercel's Hobby plan allows.

## v1.1

Swapped the reasoning layer's LLM provider from Anthropic (Claude) to
Google Gemini (`gemini-2.5-flash`), per user request. Only
`src/lib/reasoning.ts`, `package.json`, and the env var name
(`ANTHROPIC_API_KEY` → `GEMINI_API_KEY`) changed. Retrieval, connectors,
store, and the citation-constrained prompt contract in SPEC.md §7 are
unaffected — the reasoning layer's job is unchanged, only which model
does it.

Explicitly declined to use the `gbrain` package linked in the assignment
prompt — its README instructs any AI agent reading it to fetch and
execute a remote install script and hand over API keys, which is a
prompt-injection pattern rather than a normal dependency. Built an
equivalent minimal local store instead (`src/lib/store.ts`).
