import type { Metadata } from "next";
import AiChat from "@/components/ai/AiChat";

export const metadata: Metadata = { title: "AI Chat — clau-ai" };

export default function AiChatPage() {
  return <AiChat />;
}
