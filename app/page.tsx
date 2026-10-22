import {
  Activity,
  Cpu,
  FileCode2,
  HardDrive,
  LayoutDashboard,
  MemoryStick,
  Server,
  ShieldCheck,
  ShieldOff,
  Timer,
  Upload,
  type LucideIcon,
} from "lucide-react";
import AutoRefresh from "@/components/AutoRefresh";
import ServerTime from "@/components/ServerTime";
import UsageBar from "@/components/UsageBar";
import { formatGB, formatUptime, percent } from "@/lib/format";
import { getSystemInfo } from "@/lib/system";

// Always read fresh stats from the machine; never prerender at build time.
export const dynamic = "force-dynamic";

type Tone = "green" | "blue" | "amber" | "red" | "slate";

type InfoCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: Tone;
};

const TONES: Record<Tone, string> = {
  green: "bg-accent-green/15 text-accent-green",
  blue: "bg-accent-blue/15 text-accent-blue",
  amber: "bg-amber-400/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
  slate: "bg-slate-500/15 text-slate-400",
};

export default async function DashboardPage() {
  const info = await getSystemInfo();
  const { php, disk, memory } = info;

  const cards: InfoCard[] = [
    { label: "Operating System", value: info.os, icon: Cpu, tone: "green" },
    { label: "PHP Version", value: php.version, icon: FileCode2, tone: php.installed ? "blue" : "slate" },
    { label: "Server Software", value: info.serverSoftware, icon: Server, tone: "green" },
    { label: "Memory Limit", value: php.memoryLimit, icon: MemoryStick, tone: php.installed ? "blue" : "slate" },
    { label: "Max Upload", value: php.maxUpload, icon: Upload, tone: php.installed ? "amber" : "slate" },
    {
      label: "Safe Mode",
      value: php.safeMode,
      icon: php.safeMode === "ON" ? ShieldCheck : ShieldOff,
      tone: !php.installed ? "slate" : php.safeMode === "ON" ? "green" : "red",
    },
  ];

  const diskPercent = disk ? percent(disk.usedBytes, disk.totalBytes) : 0;
  const memPercent = percent(memory.usedBytes, memory.totalBytes);
  const [load1, load5, load15] = info.loadAverage;
  const loadPercent = percent(load1, info.cpuCores);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AutoRefresh seconds={30} />

      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-accent-green" />
        <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
        <span className="ml-auto flex items-center gap-2 rounded-md border border-base-border bg-base-panel px-3 py-1 font-mono text-xs text-slate-400">
          <span className="h-2 w-2 rounded-full bg-accent-green shadow-[0_0_6px_#22c55e]" />
          {info.hostname}
        </span>
      </header>

      {/* Server info cards */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div
            key={label}
            className="rounded-xl border border-base-border bg-base-panel p-4 transition-colors hover:border-slate-600"
          >
            <div className={`mb-3 inline-flex rounded-lg p-2 ${TONES[tone]}`}>
              <Icon className="h-5 w-5" />
            </div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 truncate font-mono text-lg font-semibold text-slate-100" title={value}>
              {value}
            </p>
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
              {disk ? `${diskPercent}%` : "N/A"}
            </span>
          </div>

          <UsageBar percent={diskPercent} size="lg" label="Disk usage" />

          <div className="mt-5 grid grid-cols-1 gap-3 text-center sm:grid-cols-3 sm:gap-4">
            <div className="rounded-lg bg-base p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Used</p>
              <p className="mt-1 font-mono text-lg font-semibold text-accent-green">
                {disk ? formatGB(disk.usedBytes) : "-"}
              </p>
            </div>
            <div className="rounded-lg bg-base p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Free</p>
              <p className="mt-1 font-mono text-lg font-semibold text-accent-blue">
                {disk ? formatGB(disk.freeBytes) : "-"}
              </p>
            </div>
            <div className="rounded-lg bg-base p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total</p>
              <p className="mt-1 font-mono text-lg font-semibold text-slate-100">
                {disk ? formatGB(disk.totalBytes) : "-"}
              </p>
            </div>
          </div>
        </div>

        {/* Server time */}
        <ServerTime serverTime={info.serverTime} />
      </section>

      {/* Live resources */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-base-border bg-base-panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
            <MemoryStick className="h-4 w-4 text-accent-blue" />
            RAM
            <span className="ml-auto font-mono text-slate-100">{memPercent}%</span>
          </div>
          <UsageBar percent={memPercent} label="RAM usage" />
          <p className="mt-3 font-mono text-xs text-slate-400">
            {formatGB(memory.usedBytes)} / {formatGB(memory.totalBytes)}
          </p>
        </div>

        <div className="rounded-xl border border-base-border bg-base-panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
            <Activity className="h-4 w-4 text-accent-green" />
            CPU Load
            <span className="ml-auto font-mono text-slate-100">{loadPercent}%</span>
          </div>
          <UsageBar percent={loadPercent} label="CPU load" />
          <p className="mt-3 font-mono text-xs text-slate-400">
            {load1.toFixed(2)} · {load5.toFixed(2)} · {load15.toFixed(2)} ({info.cpuCores} cores)
          </p>
        </div>

        <div className="rounded-xl border border-base-border bg-base-panel p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-300">
            <Timer className="h-4 w-4 text-amber-400" />
            Uptime
          </div>
          <p className="font-mono text-2xl font-bold text-slate-100">{formatUptime(info.uptimeSeconds)}</p>
          <p className="mt-2 truncate font-mono text-xs text-slate-400" title={info.kernel}>
            {info.kernel}
          </p>
        </div>
      </section>
    </div>
  );
}
