import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center justify-center py-24 text-center">
      <SearchX className="mb-4 h-10 w-10 text-slate-500" />
      <h1 className="font-mono text-2xl font-bold text-slate-100">404</h1>
      <p className="mt-2 text-sm text-slate-400">Halaman tidak ditemukan.</p>
      <Link href="/" className="mt-6 rounded-md bg-accent-green/15 px-4 py-2 text-sm text-accent-green hover:bg-accent-green/25">
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
