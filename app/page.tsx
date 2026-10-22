import {
  Cpu,
  FileCode2,
  HardDrive,
  LayoutDashboard,
  MemoryStick,
  Server,
  ShieldOff,
  Upload,
  type LucideIcon,
} from "lucide-react";
import ServerTime from "@/components/ServerTime";

type InfoCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: "green" | "blue" | "amber" | "red";
};

// Static values for Stage 1 — will be replaced by real data from the API later.
const SERVER_INFO: InfoCard[] = [
  { label: "Operating System", value: "Linux", icon: Cpu, tone: "green" },
  { label: "PHP Version", value: "7.4.33", icon: FileCode2, tone: "blue" },
  { label: "Server Software", value: "LiteSpeed", icon: Server, tone: "green" },
  { label: "Memory Limit", value: "128M", icon: MemoryStick, tone: "blue" },
  { label: "Max Upload", value: "2M", icon: Upload, tone: "amber" },
  { label: "Safe Mode", value: "OFF", icon: ShieldOff, tone: "red" },
];

const DISK = {
  usedGB: 1037.6,
  freeGB: 822.2,
  totalGB: 1859.9,
};

const TONES: Record<InfoCard["tone"], string> = {
  green: "bg-accent-green/15 text-accent-green",
  blue: "bg-accent-blue/15 text-accent-blue",
  amber: "bg-amber-400/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
};

export default function DashboardPage() {
  const usedPercent = Math.round((DISK.usedGB / DISK.totalGB) * 100);
  const barColor =
    usedPercent >= 90 ? "bg-red-500" : usedPercent >= 75 ? "bg-amber-400" : "bg-accent-green";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <header className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-accent-green" />
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <span className="ml-auto flex items-center gap-2 rounded-md border border-base-border bg-base-panel px-3 py-1 text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-accent-green shadow-[0_0_6px_#22c55e]" />
          Online
        </span>
      </header>

      {/* Server info cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {SERVER_INFO.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-xl border border-base-border bg-base-panel p-4 transition-colors hover:border-slate-600"
          >
            <div className={`mb-3 inline-flex rounded-lg p-2 ${TONES[tone]}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 font-mono text-lg font-semibold text-slate-100">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Disk usage */}
        <div className="rounded-xl border border-base-border bg-base-panel p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-300">
            <HardDrive className="h-4 w-4 text-accent-green" />
            Disk Usage
            <span className="ml-auto font-mono text-2xl font-bold text-slate-100">
              {usedPercent}%
            </span>
          </div>

          <div
            className="h-6 w-full overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-valuenow={usedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Disk usage"
          >
            <div
              className={`flex h-full items-center justify-end rounded-full pr-3 font-mono text-xs font-semibold text-slate-900 transition-all duration-700 ${barColor}`}
              style={{ width: `${usedPercent}%` }}
            >
              {usedPercent}% used
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-base p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Used</p>
              <p className="mt-1 font-mono text-lg font-semibold text-accent-green">
                {DISK.usedGB.toFixed(1)} GB
              </p>
            </div>
            <div className="rounded-lg bg-base p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Free</p>
              <p className="mt-1 font-mono text-lg font-semibold text-accent-blue">
                {DISK.freeGB.toFixed(1)} GB
              </p>
            </div>
            <div className="rounded-lg bg-base p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-100">
                {DISK.totalGB.toFixed(1)} GB
              </p>
            </div>
          </div>
        </div>

        {/* Server time */}
        <ServerTime />
      </section>
    </div>
  );
}
