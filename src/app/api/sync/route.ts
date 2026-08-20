import { NextResponse } from "next/server";

import { syncGmail } from "@/lib/gmail";
import { syncDrive } from "@/lib/drive";
import { upsertDocs } from "@/lib/store";
import { isConnected } from "@/lib/google";
import { storeInGBrain } from "@/lib/gbrain";

export const maxDuration = 60;

export async function POST() {
  if (!(await isConnected())) {
    return NextResponse.json(
      {
        error:
          "Not connected to Google yet. Visit /api/auth/google first.",
      },
      { status: 401 }
    );
  }

  try {
    // 1. Fetch Gmail + Drive
    const [gmailDocs, driveDocs] = await Promise.all([
      syncGmail(),
      syncDrive(),
    ]);

    const docs = [...gmailDocs, ...driveDocs];

    // 2. Keep existing application storage
    const all = await upsertDocs(docs);

    // 3. Store the same documents in GBrain
    let gbrainStored = 0;
    const gbrainErrors: string[] = [];

    for (const doc of docs) {
      try {
        await storeInGBrain(
          `google/${doc.source}/${doc.id}`,
          doc.title,
          `
Source: ${doc.source}
Date: ${doc.date}
URL: ${doc.url}

${doc.body}

${doc.snippet}
          `,
          {
            source: doc.source,
            original_id: doc.id,
            url: doc.url,
            date: doc.date,
            participants: doc.participants ?? [],
          }
        );

        gbrainStored++;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        console.error(
          `[GBrain] Failed to store ${doc.id}:`,
          message
        );

        gbrainErrors.push(
          `${doc.source}:${doc.id}: ${message}`
        );
      }
    }

    return NextResponse.json({
      ok: true,
      gmailCount: gmailDocs.length,
      driveCount: driveDocs.length,
      totalStored: all.length,
      gbrainStored,
      gbrainErrors,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);

    console.error("[Sync] Failed:", message);

    return NextResponse.json(
      {
        error: message || "sync failed",
      },
      { status: 500 }
    );
  }
}