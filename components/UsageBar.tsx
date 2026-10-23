type UsageBarProps = {
  percent: number;
  size?: "md" | "lg";
  label: string;
};

export default function UsageBar({ percent, size = "md", label }: UsageBarProps) {
  const value = Math.min(100, Math.max(0, percent));
  const color = value >= 90 ? "bg-red-500" : value >= 75 ? "bg-amber-400" : "bg-accent-green";
  const height = size === "lg" ? "h-6" : "h-2.5";

  return (
    <div
      className={`${height} w-full overflow-hidden rounded-full bg-slate-800`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`flex h-full items-center justify-end rounded-full pr-3 font-mono text-xs font-semibold text-slate-900 transition-all duration-700 ${color}`}
        style={{ width: `${value}%` }}
      >
        {size === "lg" && value >= 12 && `${value}% used`}
      </div>
    </div>
  );
}
