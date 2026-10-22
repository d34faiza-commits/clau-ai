"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ServerTime() {
  // null on first render so server and client markup match (no hydration mismatch)
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`
    : "--:--:--";
  const date = now
    ? `${DAYS[now.getUTCDay()]}, ${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`
    : "Loading…";
  const iso = now ? now.toISOString() : "";

  return (
    <div className="rounded-xl border border-base-border bg-base-panel p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-300">
        <Clock className="h-4 w-4 text-accent-blue" />
        Server Time
        <span className="ml-auto rounded bg-accent-blue/15 px-2 py-0.5 font-mono text-xs text-accent-blue">
          UTC
        </span>
      </div>
      <p className="font-mono text-4xl font-bold tracking-wider text-slate-100">{time}</p>
      <p className="mt-2 text-sm text-slate-400">{date}</p>
      <p className="mt-1 font-mono text-xs text-slate-500">{iso}</p>
    </div>
  );
}
