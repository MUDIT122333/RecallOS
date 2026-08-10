import fs from "fs";
import path from "path";
import os from "os";
import { Redis } from "@upstash/redis";
import { BrainDoc } from "./types";

/**
 * Two storage backends behind the same async interface:
 *
 * - Upstash Redis (when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *   are set) — a real persistent store reachable over HTTP, which is what
 *   makes this work correctly on Vercel's serverless functions. This is
 *   what production (Vercel) should use.
 * - Local JSON file (fallback) — zero setup for local dev. Also used as a
 *   safety net if the preferred directory isn't writable (e.g. someone
 *   deploys without configuring Redis — the app degrades to "works within
 *   a single warm invocation" instead of crashing).
 */
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

function resolveDataDir(): string {
  const preferred = process.env.BRAIN_DATA_DIR || "./data";
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), "personal-brain-data");
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

const DATA_DIR = redis ? null : resolveDataDir();
const DOCS_FILE = DATA_DIR ? path.join(DATA_DIR, "docs.json") : "";
const TOKENS_FILE = DATA_DIR ? path.join(DATA_DIR, "tokens.json") : "";

const DOCS_KEY = "brain:docs";
const TOKENS_KEY = "brain:tokens";

export async function loadDocs(): Promise<BrainDoc[]> {
  if (redis) {
    const data = await redis.get<BrainDoc[]>(DOCS_KEY);
    return data || [];
  }
  if (!fs.existsSync(DOCS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DOCS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export async function saveDocs(docs: BrainDoc[]): Promise<void> {
  if (redis) {
    await redis.set(DOCS_KEY, docs);
    return;
  }
  fs.writeFileSync(DOCS_FILE, JSON.stringify(docs, null, 2));
}

/** Upsert by id, keeping the store idempotent across repeated syncs. */
export async function upsertDocs(newDocs: BrainDoc[]): Promise<BrainDoc[]> {
  const existing = await loadDocs();
  const byId = new Map(existing.map((d) => [d.id, d]));
  for (const d of newDocs) byId.set(d.id, d);
  const merged = Array.from(byId.values());
  await saveDocs(merged);
  return merged;
}

export async function loadTokens(): Promise<any | null> {
  if (redis) {
    return (await redis.get(TOKENS_KEY)) || null;
  }
  if (!fs.existsSync(TOKENS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: any): Promise<void> {
  if (redis) {
    await redis.set(TOKENS_KEY, tokens);
    return;
  }
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

export function isRedisConfigured(): boolean {
  return !!redis;
}
