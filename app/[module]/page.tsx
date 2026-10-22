import { notFound } from "next/navigation";
import { Construction } from "lucide-react";

// Sidebar modules that will be built in later stages.
const MODULES: Record<string, string> = {
  "file-manager": "File Manager",
  database: "Database",
  "ai-chat": "AI Chat",
  security: "Security",
  "infra-scan": "Infra Scan",
  "php-info": "PHP Info",
  compliance: "Compliance",
};

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(MODULES).map((module) => ({ module }));
}

export default function ModulePlaceholder({ params }: { params: { module: string } }) {
  const title = MODULES[params.module];
  if (!title) notFound();

  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center justify-center rounded-xl border border-dashed border-base-border bg-base-panel/50 py-24 text-center">
      <Construction className="mb-4 h-10 w-10 text-amber-400" />
      <h1 className="text-xl font-semibold text-slate-100">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">Modul ini sedang dibangun dan akan hadir di tahap berikutnya.</p>
    </div>
  );
}
