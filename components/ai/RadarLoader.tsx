export default function RadarLoader() {
  return (
    <div className="flex items-center gap-3" role="status" aria-label="Processing">
      <div className="relative h-10 w-10 overflow-hidden rounded-full border border-accent-green/50 bg-accent-green/5">
        {/* crosshair rings */}
        <div className="absolute inset-[30%] rounded-full border border-accent-green/30" />
        <div className="absolute left-1/2 top-0 h-full w-px bg-accent-green/20" />
        <div className="absolute left-0 top-1/2 h-px w-full bg-accent-green/20" />
        <div className="radar-sweep absolute inset-0 rounded-full" />
        <div className="radar-ping absolute inset-0 rounded-full border border-accent-green" />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-green shadow-[0_0_6px_#22c55e]" />
      </div>
      <span className="animate-pulse font-mono text-xs font-semibold tracking-[0.3em] text-accent-green">PROCESSING...</span>
    </div>
  );
}
