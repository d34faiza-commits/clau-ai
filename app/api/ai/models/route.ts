import { NextResponse } from "next/server";
import { AiError, listModels } from "@/lib/ai/client";
import { loadAiConfig } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

/** GET /api/ai/models — models offered by the configured provider. */
export async function GET() {
  const cfg = await loadAiConfig();
  if (!cfg) return NextResponse.json({ error: "AI is not configured" }, { status: 400 });
  try {
    return NextResponse.json({ models: await listModels(cfg) });
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
