import { NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google";

export async function GET() {
  const url = await getAuthUrl();
  return NextResponse.redirect(url);
}
