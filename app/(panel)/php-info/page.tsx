import type { Metadata } from "next";
import PhpInfoView from "@/components/php/PhpInfoView";

export const metadata: Metadata = { title: "PHP Info — clau-ai" };

export default function PhpInfoPage() {
  return <PhpInfoView />;
}
