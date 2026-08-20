import { GoogleGenAI } from "@google/genai";
import {
  SearchResult,
  ChatResponse,
  ChatCitation,
} from "./types";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `You are "Personal Brain", a conversational assistant that answers questions using ONLY the documents provided to you in the current turn. Those documents come from the user's own Gmail and Google Drive.

Rules:
1. Only state facts that are supported by the provided documents. Never invent dates, names, statuses, or content that isn't in them.
2. Every factual claim must be traceable to a specific document. Refer to sources naturally in prose, e.g. "your email to Priya on March 3" or "the contract draft in Drive".
3. If the documents don't contain enough information to answer, say so plainly instead of guessing. "I don't know" beats a confident wrong answer.
4. If the question asks about a connector that isn't in the provided documents at all (e.g. calendar, Slack), say that connector isn't wired up yet rather than fabricating data.
5. Write a short, conversational answer — not a bullet-by-bullet dump of every document. Synthesize across sources when the question requires it.`;

function formatDoc(r: SearchResult, i: number): string {
  const d = r.doc;

  return `[Doc ${i + 1}] source=${d.source} title="${d.title}" date=${d.date}
${d.body || d.snippet}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMessageWithRetry(
  chat: any,
  message: string,
  maxAttempts = 3
) {
  let lastErr: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await chat.sendMessage({
        message,
      });
    } catch (err: any) {
      lastErr = err;

      const is503 =
        err?.status === 503 ||
        String(err?.message || "").includes("UNAVAILABLE");

      if (!is503 || attempt === maxAttempts) {
        throw err;
      }

      await sleep(attempt * 1000);
    }
  }

  throw lastErr;
}

export async function answerQuery(
  query: string,
  results: SearchResult[],
  history: {
    role: "user" | "assistant";
    content: string;
  }[] = []
): Promise<ChatResponse> {
  if (results.length === 0) {
    return {
      answer:
        "I couldn't find anything in your connected Gmail or Drive data that relates to that. " +
        "Try rephrasing, or run a sync first if you haven't pulled recent data yet.",
      citations: [],
    };
  }

  /*
   * Build grounded context from retrieved documents.
   */
  const context = results
    .map(formatDoc)
    .join("\n\n---\n\n");

  const userTurn =
    `Documents:\n\n${context}\n\n---\n\nQuestion: ${query}`;

  /*
   * Gemini requires valid content parts.
   *
   * Filter:
   * - empty messages
   * - whitespace-only messages
   * - malformed history entries
   *
   * Also remove leading assistant/model messages because Gemini
   * history must start with a user message.
   */
  let trimmedHistory = history.filter(
    (h) =>
      h &&
      (h.role === "user" || h.role === "assistant") &&
      typeof h.content === "string" &&
      h.content.trim().length > 0
  );

  while (
    trimmedHistory.length > 0 &&
    trimmedHistory[0].role === "assistant"
  ) {
    trimmedHistory = trimmedHistory.slice(1);
  }

  /*
   * Convert our history format to Gemini's format.
   */
  const geminiHistory = trimmedHistory.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [
      {
        text: h.content.trim(),
      },
    ],
  }));

  /*
   * Create Gemini chat.
   */
  const chat = ai.chats.create({
    model: MODEL,
    history: geminiHistory,
    config: {
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  /*
   * Send the grounded question.
   */
  const response = await sendMessageWithRetry(
    chat,
    userTurn
  );

  const answer = (response.text || "").trim();

  /*
   * Return citations for all retrieved documents.
   */
  const citations: ChatCitation[] = results.map((r) => ({
    source: r.doc.source,
    title: r.doc.title,
    url: r.doc.url,
    date: r.doc.date,
  }));

  return {
    answer,
    citations,
  };
}