import { NextResponse } from "next/server";
import { syncGmail } from "@/lib/gmail";
import { syncDrive } from "@/lib/drive";
import { upsertDocs } from "@/lib/store";
import { isConnected } from "@/lib/google";

// Sync fetches many Gmail/Drive items and can take a while — request the
// max duration Vercel's Hobby plan allows so it doesn't get cut off mid-sync.
export const maxDuration = 60;

export async function POST() {
  if (!(await isConnected())) {
    return NextResponse.json(
      { error: "Not connected to Google yet. Visit /api/auth/google first." },
      { status: 401 }
    );
  }

  try {
    const [gmailDocs, driveDocs] = await Promise.all([syncGmail(), syncDrive()]);
    const all = await upsertDocs([...gmailDocs, ...driveDocs]);
    return NextResponse.json({
      ok: true,
      gmailCount: gmailDocs.length,
      driveCount: driveDocs.length,
      totalStored: all.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "sync failed" }, { status: 500 });
  }
}
