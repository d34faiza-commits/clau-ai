import type { Metadata } from "next";
import DatabaseManager from "@/components/database/DatabaseManager";

export const metadata: Metadata = { title: "Database — clau-ai" };

export default function DatabasePage() {
  return <DatabaseManager />;
}
