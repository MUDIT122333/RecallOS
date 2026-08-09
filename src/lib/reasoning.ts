import { GoogleGenAI } from "@google/genai";
import { SearchResult, ChatResponse, ChatCitation } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// gemini-2.5-flash was retired for new API keys in 2026; gemini-3.6-flash
// is the current GA Flash model as of this writing. If Google renames or
// retires this again, this is the one line that needs to change.
const MODEL = "gemini-3.6-flash";

const SYSTEM_PROMPT = `You are "Personal Brain", a conversational assistant that answers \
questions using ONLY the documents provided to you in the current turn. Those documents \
come from the user's own Gmail and Google Drive.

Rules:
1. Only state facts that are supported by the provided documents. Never invent dates, \
names, statuses, or content that isn't in them.
2. Every factual claim must be traceable to a specific document. Refer to sources \
naturally in prose, e.g. "your email to Priya on March 3" or "the contract draft in Drive".
3. If the documents don't contain enough information to answer, say so plainly instead \
of guessing. "I don't know" beats a confident wrong answer.
4. If the question asks about a connector that isn't in the provided documents at all \
(e.g. calendar, Slack), say that connector isn't wired up yet rather than fabricating data.
5. Write a short, conversational answer — not a bullet-by-bullet dump of every document. \
Synthesize across sources when the question requires it (e.g. combine an email thread's \
status with a matching file in Drive).`;

function formatDoc(r: SearchResult, i: number): string {
  const d = r.doc;
  return `[Doc ${i + 1}] source=${d.source} title="${d.title}" date=${d.date}\n${d.body || d.snippet}`;
}

export async function answerQuery(
  query: string,
  results: SearchResult[],
  history: { role: "user" | "assistant"; content: string }[] = []
): Promise<ChatResponse> {
  if (results.length === 0) {
    return {
      answer:
        "I couldn't find anything in your connected Gmail or Drive data that relates to that. " +
        "Try rephrasing, or run a sync first if you haven't pulled recent data yet.",
      citations: [],
    };
  }

  const context = results.map(formatDoc).join("\n\n---\n\n");
  const userTurn = `Documents:\n\n${context}\n\n---\n\nQuestion: ${query}`;

  // Gemini's chat history uses role "model" instead of "assistant", and
  // requires history to START with a "user" turn — drop any leading
  // assistant turns (e.g. the UI's hardcoded welcome message).
  let trimmedHistory = history;
  while (trimmedHistory.length > 0 && trimmedHistory[0].role === "assistant") {
    trimmedHistory = trimmedHistory.slice(1);
  }
  const geminiHistory = trimmedHistory.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));

  const chat = ai.chats.create({
    model: MODEL,
    history: geminiHistory,
    config: { systemInstruction: SYSTEM_PROMPT },
  });

  const response = await chat.sendMessage({ message: userTurn });
  const answer = (response.text || "").trim();

  const citations: ChatCitation[] = results.map((r) => ({
    source: r.doc.source,
    title: r.doc.title,
    url: r.doc.url,
    date: r.doc.date,
  }));

  return { answer, citations };
}
