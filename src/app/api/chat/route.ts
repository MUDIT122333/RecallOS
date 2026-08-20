import { NextRequest, NextResponse } from "next/server";

import { loadDocs } from "@/lib/store";
import { retrieve } from "@/lib/retrieval";
import { answerQuery } from "@/lib/reasoning";
import { searchGBrain } from "@/lib/gbrain";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const query: string = body.query;
  const history = body.history || [];

  if (!query || typeof query !== "string") {
    return NextResponse.json(
      { error: "missing query" },
      { status: 400 }
    );
  }

  try {
    /*
     * Primary retrieval: GBrain
     *
     * GBrain contains Gmail + Google Drive documents that were
     * imported during Sync Now.
     */
    let gbrainResults: Awaited<ReturnType<typeof searchGBrain>> = [];

    try {
      gbrainResults = await searchGBrain(query, 8);
    } catch (error) {
      console.error("[GBrain] Search failed:", error);
    }

    /*
     * Existing application store remains as a fallback.
     */
    const docs = await loadDocs();

    const localResults =
      docs.length > 0
        ? retrieve(docs, query, { perSourceLimit: 6 })
        : [];

    /*
     * If neither GBrain nor the local store has anything,
     * give the user the existing empty-brain message.
     */
    if (gbrainResults.length === 0 && localResults.length === 0) {
      return NextResponse.json({
        answer:
          'Your brain is empty — click "Sync now" first so I can pull in your Gmail and Drive data.',
        citations: [],
      });
    }

    /*
     * Convert GBrain results into the format expected by the
     * existing reasoning layer.
     *
     * GBrain CLI returns human-readable search output, so we
     * construct lightweight documents from the retrieved chunks.
     */
const gbrainDocs = gbrainResults.map((result, index) => {
  const isGmail = result.slug.startsWith("google/gmail/");
  const isDrive = result.slug.startsWith("google/drive/");

  const source: "gmail" | "drive" = isGmail ? "gmail" : "drive";

  return {
    doc: {
      id: `gbrain:${index}:${result.slug}`,
      source,
      title: result.slug,
      snippet: result.chunk_text || "",
      body: result.chunk_text || "",
      date: "",
      url: "",
      meta: {
        gbrain: true,
        slug: result.slug,
        score: result.score,
        detectedSource: isGmail
          ? "gmail"
          : isDrive
            ? "drive"
            : "unknown",
      },
    },
    score:
      typeof result.score === "number"
        ? result.score
        : 1 / (index + 1),
    reason: "Retrieved from GBrain",
  };
});

    /*
     * Combine GBrain + existing retrieval results.
     *
     * GBrain results are placed first because they represent
     * the project's persistent semantic memory.
     */
    const combinedResults = [
      ...gbrainDocs,
      ...localResults,
    ];

    /*
     * Limit context sent to Gemini.
     */
    const finalResults = combinedResults.slice(0, 12);

    const response = await answerQuery(
      query,
      finalResults,
      history
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Chat] Failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "chat failed",
      },
      { status: 500 }
    );
  }
}