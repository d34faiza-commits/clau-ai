"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Database,
  FolderOpen,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanSearch,
  Shield,
  ClipboardCheck,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "File Manager", href: "/file-manager", icon: FolderOpen },
  { label: "Database", href: "/database", icon: Database },
  { label: "AI Chat", href: "/ai-chat", icon: Bot },
  { label: "Security", href: "/security", icon: Shield },
  { label: "Infra Scan", href: "/infra-scan", icon: ScanSearch },
  { label: "PHP Info", href: "/php-info", icon: Info },
  { label: "Compliance", href: "/compliance", icon: ClipboardCheck },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-30 rounded-md border border-base-border bg-base-panel p-2 text-slate-300 md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-base-border bg-base-panel transition-all duration-200",
          "md:sticky md:top-0 md:h-screen md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "w-[72px]" : "w-60",
        ].join(" ")}
      >
        {/* Brand */}
        <div className="flex h-16 items-center justify-between border-b border-base-border px-4">
          <Link href="/" className="flex items-center gap-2 text-accent-green">
            <Terminal className="h-5 w-5 shrink-0" />
            {!collapsed && (
              <span className="font-mono text-lg font-bold tracking-tight">clau-ai</span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="text-slate-400 hover:text-slate-200 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto py-4">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? label : undefined}
                className={[
                  "relative flex items-center gap-3 px-5 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-accent-green/15 font-medium text-accent-green"
                    : "text-slate-400 hover:bg-base-hover hover:text-slate-200",
                ].join(" ")}
              >
                {active && (
                  <span className="absolute inset-y-0 left-0 w-1 rounded-r bg-accent-green" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle (desktop) */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="mx-auto mb-4 hidden rounded-md p-2 text-slate-500 hover:bg-base-hover hover:text-slate-300 md:block"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>

        {/* Logout */}
        <div className="border-t border-base-border p-4">
          <button
            type="button"
            className={[
              "flex w-full items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20",
              collapsed ? "justify-center" : "",
            ].join(" ")}
            title="Logout"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
