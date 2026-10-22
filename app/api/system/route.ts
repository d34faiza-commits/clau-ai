import { NextResponse } from "next/server";
import { getSystemInfo } from "@/lib/system";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = await getSystemInfo();
  return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
}
