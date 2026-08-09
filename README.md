# Personal Brain

A conversational agent over your own Gmail + Google Drive. Ask it a
question, it pulls facts from both, correlates across them, and answers
in prose with clickable citations back to the original email/file.

Read `SPEC.md` first — this was built spec-driven-development style: the
spec was written before the bulk of the code, and the milestones there
map 1:1 onto the files below.

**Note on the assignment's linked "gbrain" repo:** that GitHub repo is
written to get AI coding agents to auto-install a global CLI and hand
over API keys via a remote "install instructions" fetch — a prompt-
injection pattern, not a normal library. I didn't wire it in. Instead
`src/lib/store.ts` is our own ~40-line JSON-backed store that does the
same conceptual job (normalize + persist + read back) with code you can
actually read line by line.

## What's here

```
SPEC.md                  the spec, written first
src/lib/types.ts          shared BrainDoc schema
src/lib/store.ts          local JSON store (swap for Postgres/KV in prod)
src/lib/google.ts         OAuth2 client + token persistence
src/lib/gmail.ts          Gmail connector (sync + normalize)
src/lib/drive.ts          Drive connector (sync + normalize)
src/lib/retrieval.ts      keyword search + cross-source correlation
src/lib/reasoning.ts      grounded prompt + Gemini API call
src/app/page.tsx          chat UI
src/app/api/*             OAuth, sync, and chat routes
```

## Setup

### 1. Google Cloud project (5 min)

1. Go to https://console.cloud.google.com/ and create a project (or reuse one).
2. **APIs & Services → Library**: enable **Gmail API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: choose "External", add your
   own Google account as a test user (you don't need to publish the app).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: Web application
   - Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Copy the Client ID and Client Secret.

### 2. Gemini API key

Grab one from https://aistudio.google.com/app/apikey (free tier available).

### 3. Configure

```bash
cp .env.example .env
# fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GEMINI_API_KEY
```

### 4. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, click **sync now** — it'll redirect you
through Google's OAuth consent screen once, then pull your recent Gmail
+ Drive data into `data/docs.json`. Ask away.

## Verifying the example queries from the assignment

- **Tier 1:** "Find the email from Stripe about the failed payment" —
  pure Gmail keyword match, works out of the box if such an email exists
  in your inbox.
- **Tier 1 (out of scope, by design):** calendar and Slack queries aren't
  wired up in v1 — the brain will tell you that connector isn't
  available rather than guessing. See SPEC.md §6 for why.
- **Tier 2:** "What jobs have I applied to, and what's my status on each,
  including my take-home submission?" — pulls matching Gmail threads
  (clustered by sender/company), and correlates them against Drive files
  whose names look like resumes/applications/take-homes (SPEC.md §5).
- **Tier 2:** "Did I ever send \<name\> the contract draft, and did they
  reply?" — filters Gmail by participant name, matches the attachment to
  a Drive file, and checks the thread for a reply.

## Deploying to Vercel

`vercel deploy` works out of the box for the UI and API routes. Two
things to know before you do:

1. Set `GOOGLE_REDIRECT_URI`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GEMINI_API_KEY` as Vercel environment variables, and add
   `https://<your-app>.vercel.app/api/auth/google/callback` as an
   additional authorized redirect URI in the Google Cloud console
   (alongside the localhost one — don't remove that one).
2. **Storage:** local disk doesn't persist across Vercel's serverless
   invocations, so `src/lib/store.ts` uses Upstash Redis in production
   instead. From the Vercel dashboard, go to **Storage → Create Database
   → Upstash for Redis** (free tier), connect it to this project, and
   Vercel automatically adds `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` as env vars. Locally, leave those two unset
   — the app falls back to the local JSON file store automatically, so
   local dev needs no Redis setup at all.

## Known limitations (v1, documented rather than hidden)

- Retrieval is keyword + heuristic, not embeddings — see SPEC.md §2 for
  why, and what the upgrade path looks like (swap `retrieval.ts`'s
  `scoreDoc` for a vector similarity call; the rest of the pipeline is
  unaffected because retrieval already returns a stable `SearchResult[]`
  contract).
- Drive text extraction only covers Google Docs + plain text files;
  PDFs/Word docs are indexed by filename only (still enough for the
  filename-correlation heuristic, just not full-text search inside them).
- Local disk store is dev-only; production (Vercel) uses Upstash Redis
  behind the same `loadDocs`/`saveDocs`/`loadTokens`/`saveTokens`
  interface, so nothing else in the app needed to change. See SPEC.md §8.
