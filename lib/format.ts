const GB = 1024 ** 3;

/** Bytes to "1037.6 GB" (binary units, like `df -h`). */
export function formatGB(bytes: number): string {
  return `${(bytes / GB).toFixed(1)} GB`;
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** Seconds to "12d 4h 31m". */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}
