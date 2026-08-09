import { NextRequest, NextResponse } from "next/server";
import { loadDocs } from "@/lib/store";
import { retrieve } from "@/lib/retrieval";
import { answerQuery } from "@/lib/reasoning";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const query: string = body.query;
  const history = body.history || [];

  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "missing query" }, { status: 400 });
  }

  const docs = await loadDocs();
  if (docs.length === 0) {
    return NextResponse.json({
      answer:
        "Your brain is empty — click \"Sync now\" first so I can pull in your Gmail and Drive data.",
      citations: [],
    });
  }

  const results = retrieve(docs, query, { perSourceLimit: 6 });
  const response = await answerQuery(query, results, history);
  return NextResponse.json(response);
}
