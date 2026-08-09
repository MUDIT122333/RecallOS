export type Source = "gmail" | "drive";

export interface BrainDoc {
  id: string; // "gmail:<messageId>" | "drive:<fileId>"
  source: Source;
  title: string;
  snippet: string;
  body: string;
  participants?: string[];
  date: string; // ISO
  url: string;
  meta: Record<string, any>;
}

export interface SearchResult {
  doc: BrainDoc;
  score: number;
  reason: string; // why this doc matched / was correlated in
}

export interface ChatCitation {
  source: Source;
  title: string;
  url: string;
  date: string;
}

export interface ChatResponse {
  answer: string;
  citations: ChatCitation[];
}
