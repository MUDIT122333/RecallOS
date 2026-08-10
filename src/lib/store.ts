import fs from "fs";
import path from "path";
import os from "os";
import Redis from "ioredis";
import { BrainDoc } from "./types";

/**
 * Two storage backends behind the same async interface:
 *
 * - Redis, via a standard connection string in REDIS_URL — this is what
 *   Vercel's official "Redis" (Redis Cloud) marketplace integration
 *   provides when connected to a project. This is a real persistent store
 *   reachable from any serverless invocation, which is what makes this
 *   work correctly on Vercel (local disk does not persist there).
 * - Local JSON file (fallback) — zero setup for local dev, and a safety
 *   net if someone deploys without connecting Redis (degrades to "works
 *   within a single warm invocation" instead of crashing).
 */
let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!redisClient) {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    redisClient.on("error", (err) => console.error("Redis client error:", err));
  }
  return redisClient;
}

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

const usingRedis = !!process.env.REDIS_URL;
const DATA_DIR = usingRedis ? null : resolveDataDir();
const DOCS_FILE = DATA_DIR ? path.join(DATA_DIR, "docs.json") : "";
const TOKENS_FILE = DATA_DIR ? path.join(DATA_DIR, "tokens.json") : "";

const DOCS_KEY = "brain:docs";
const TOKENS_KEY = "brain:tokens";

export async function loadDocs(): Promise<BrainDoc[]> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get(DOCS_KEY);
    return data ? JSON.parse(data) : [];
  }
  if (!fs.existsSync(DOCS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DOCS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export async function saveDocs(docs: BrainDoc[]): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(DOCS_KEY, JSON.stringify(docs));
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
  const redis = getRedis();
  if (redis) {
    const data = await redis.get(TOKENS_KEY);
    return data ? JSON.parse(data) : null;
  }
  if (!fs.existsSync(TOKENS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export async function saveTokens(tokens: any): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.set(TOKENS_KEY, JSON.stringify(tokens));
    return;
  }
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

export function isRedisConfigured(): boolean {
  return usingRedis;
}