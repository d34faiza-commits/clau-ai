import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import { AiError, chat } from "@/lib/ai/client";
import { isConnected, loadAiConfig } from "@/lib/ai/config";
import type { ChatMessage } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_MESSAGES = 40;
const MAX_CHARS = 32_000;

function sanitize(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const messages = input
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_MESSAGES);
  // the conversation must start with the user and end with the user's new message
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return null;
  return messages;
}

/** POST /api/ai/chat — { messages: [{ role, content }] } → { reply, model } */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  const cfg = await loadAiConfig();
  if (!isConnected(cfg)) {
    return NextResponse.json({ error: "AI is not configured — open Configure and connect a provider" }, { status: 400 });
  }
  const body = await request.json().catch(() => ({}));
  const messages = sanitize(body.messages);
  if (!messages) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });

  try {
    const reply = await chat(cfg!, messages);
    return NextResponse.json({ reply, model: cfg!.model, provider: cfg!.provider });
  } catch (err) {
    const status = err instanceof AiError ? err.status : 500;
    if (!(err instanceof AiError)) console.error("[ai-chat]", err);
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
