# Changelog

## v1 (initial build)

Implemented per SPEC.md milestones M0–M8. No deviations from the spec
during implementation — retrieval, reasoning, and connector behavior all
match SPEC.md sections 3–8 as written.

Explicitly declined to implement (see SPEC.md §2 for reasoning):
- Vector embeddings for retrieval (heuristic keyword search used instead).
- Slack/Notion connectors (interface left extensible; not built).
- Hosted persistent DB (local JSON store; noted as a swap-in for prod).



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
