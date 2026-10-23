import "server-only";
import fs from "node:fs/promises";
import type { CheckResult, CheckStatus, Framework, ScanReport } from "./types";
import { exists, phpIni, phpSupportStatus, readText, runningProcesses, sshdConfig } from "./host";

type Control = { soc2: string; iso: string };

type Check = {
  name: string;
  controls: Control;
  run: () => Promise<{ status: CheckStatus; detail: string; recommendation: string }>;
};

const ok = (detail: string) => ({ status: "PASS" as const, detail, recommendation: "No action needed" });

function anyRunning(procs: Set<string>, names: string[]): string | undefined {
  return names.find((n) => [...procs].some((p) => p === n || p.startsWith(n)));
}

function buildChecks(procs: Set<string>): Check[] {
  return [
    {
      name: "Root SSH Login Disabled",
      controls: { soc2: "CC6.1", iso: "A.8.2" },
      run: async () => {
        const ssh = await sshdConfig();
        if (!ssh) return { status: "INFO", detail: "OpenSSH server not installed", recommendation: "No action needed" };
        const value = ssh.get("permitrootlogin") ?? "prohibit-password (default)";
        if (value.startsWith("no")) return ok("PermitRootLogin no");
        if (value.startsWith("prohibit-password") || value.startsWith("without-password"))
          return { status: "WARN", detail: `PermitRootLogin ${value} (key login still allowed)`, recommendation: "Set PermitRootLogin no and use sudo from a named account" };
        return { status: "FAIL", detail: `PermitRootLogin ${value}`, recommendation: "Set PermitRootLogin no in /etc/ssh/sshd_config, then: systemctl reload ssh" };
      },
    },
    {
      name: "SSH Password Authentication Disabled",
      controls: { soc2: "CC6.1", iso: "A.8.5" },
      run: async () => {
        const ssh = await sshdConfig();
        if (!ssh) return { status: "INFO", detail: "OpenSSH server not installed", recommendation: "No action needed" };
        const value = ssh.get("passwordauthentication") ?? "yes (default)";
        return value.startsWith("no")
          ? ok("PasswordAuthentication no — key-based login only")
          : { status: "FAIL", detail: `PasswordAuthentication ${value}`, recommendation: "Use SSH keys and set PasswordAuthentication no" };
      },
    },
    {
      name: "Firewall Active",
      controls: { soc2: "CC6.6", iso: "A.8.20" },
      run: async () => {
        const ufw = await readText("/etc/ufw/ufw.conf");
        if (ufw && /^ENABLED=yes/m.test(ufw)) return ok("UFW is enabled");
        const fw = anyRunning(procs, ["firewalld", "csf", "lfd"]);
        if (fw) return ok(`${fw} is running`);
        if (await exists("/etc/nftables.conf")) {
          const nft = await readText("/etc/nftables.conf");
          if (nft && /\bhook input\b[\s\S]*policy drop/.test(nft)) return ok("nftables input policy drop");
        }
        return { status: "FAIL", detail: "No active firewall detected (UFW, firewalld, CSF, nftables)", recommendation: "ufw default deny incoming && ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable" };
      },
    },
    {
      name: "Brute-force Protection",
      controls: { soc2: "CC6.6", iso: "A.8.16" },
      run: async () => {
        const p = anyRunning(procs, ["fail2ban-server", "fail2ban", "lfd", "crowdsec", "sshguard"]);
        return p
          ? ok(`${p} is running`)
          : { status: "WARN", detail: "No fail2ban / CrowdSec / CSF-LFD process found", recommendation: "apt install fail2ban && systemctl enable --now fail2ban" };
      },
    },
    {
      name: "Automatic Security Updates",
      controls: { soc2: "CC7.1", iso: "A.8.8" },
      run: async () => {
        const auto = await readText("/etc/apt/apt.conf.d/20auto-upgrades");
        if (auto && /Unattended-Upgrade\s+"1"/.test(auto)) return ok("unattended-upgrades enabled");
        if (await exists("/etc/dnf/automatic.conf")) return ok("dnf-automatic installed");
        return { status: "WARN", detail: "Unattended security upgrades not configured", recommendation: "apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades" };
      },
    },
    {
      name: "Pending Reboot for Updates",
      controls: { soc2: "CC7.1", iso: "A.8.8" },
      run: async () =>
        (await exists("/var/run/reboot-required"))
          ? { status: "WARN", detail: "Updates installed that require a reboot (e.g. kernel)", recommendation: "Schedule a reboot to load the patched kernel/libraries" }
          : ok("No reboot pending"),
    },
    {
      name: "PHP Version Supported",
      controls: { soc2: "CC7.1", iso: "A.8.8" },
      run: async () => {
        const ini = await phpIni();
        if (!ini) return { status: "INFO", detail: "PHP CLI not found", recommendation: "Set PHP_BINARY if PHP is installed elsewhere" };
        const s = phpSupportStatus(ini.version);
        return { status: s.status, detail: `${ini.version} — ${s.note}`, recommendation: s.status === "PASS" ? "No action needed" : "Upgrade to PHP 8.3 or newer" };
      },
    },
    {
      name: "expose_php = Off",
      controls: { soc2: "CC6.8", iso: "A.8.9" },
      run: async () => {
        const ini = await phpIni();
        if (!ini) return { status: "INFO", detail: "PHP CLI not found", recommendation: "No action needed" };
        const isOn = ini.values.expose_php === "1";
        return isOn
          ? { status: "WARN", detail: "expose_php = On (version leaked in headers)", recommendation: "Set expose_php = Off in php.ini" }
          : ok("expose_php = Off");
      },
    },
    {
      name: "Time Synchronization",
      controls: { soc2: "CC7.2", iso: "A.8.17" },
      run: async () => {
        const p = anyRunning(procs, ["systemd-timesyn", "chronyd", "ntpd", "openntpd"]);
        return p
          ? ok(`${p} is running`)
          : { status: "WARN", detail: "No NTP service detected — log timestamps may drift", recommendation: "timedatectl set-ntp true (or install chrony)" };
      },
    },
    {
      name: "Audit Logging (auditd)",
      controls: { soc2: "CC7.2", iso: "A.8.15" },
      run: async () =>
        anyRunning(procs, ["auditd"])
          ? ok("auditd is running")
          : { status: "WARN", detail: "auditd is not running", recommendation: "apt install auditd && systemctl enable --now auditd" },
    },
    {
      name: "System Logging",
      controls: { soc2: "CC7.2", iso: "A.8.15" },
      run: async () => {
        const p = anyRunning(procs, ["rsyslogd", "systemd-journal", "syslog-ng"]);
        return p
          ? ok(`${p} is running`)
          : { status: "FAIL", detail: "No system log daemon detected", recommendation: "Enable systemd-journald persistent storage or rsyslog" };
      },
    },
    {
      name: "Malware Scanner Installed",
      controls: { soc2: "CC6.8", iso: "A.8.7" },
      run: async () => {
        for (const bin of ["/usr/bin/clamscan", "/usr/local/sbin/maldet", "/usr/bin/imunify360-agent", "/usr/local/bin/rkhunter", "/usr/bin/rkhunter"]) {
          if (await exists(bin)) return ok(`Found ${bin}`);
        }
        return { status: "WARN", detail: "No ClamAV / Maldet / Imunify / rkhunter found", recommendation: "Install ClamAV + Linux Malware Detect and schedule daily scans" };
      },
    },
    {
      name: "Password Expiry Policy",
      controls: { soc2: "CC6.1", iso: "A.5.17" },
      run: async () => {
        const defs = await readText("/etc/login.defs");
        const m = defs?.match(/^PASS_MAX_DAYS\s+(\d+)/m);
        const days = m ? Number(m[1]) : NaN;
        if (Number.isNaN(days)) return { status: "INFO", detail: "/etc/login.defs not readable", recommendation: "No action needed" };
        return days <= 365
          ? ok(`PASS_MAX_DAYS ${days}`)
          : { status: "WARN", detail: `PASS_MAX_DAYS ${days} (passwords never expire)`, recommendation: "Set PASS_MAX_DAYS to 90–365 in /etc/login.defs, or enforce key-only login" };
      },
    },
    {
      name: "Shadow File Permissions",
      controls: { soc2: "CC6.1", iso: "A.8.3" },
      run: async () => {
        try {
          const mode = (await fs.stat("/etc/shadow")).mode & 0o777;
          return mode & 0o007
            ? { status: "FAIL", detail: `/etc/shadow is ${mode.toString(8)} (readable by others)`, recommendation: "chmod 640 /etc/shadow" }
            : ok(`/etc/shadow is ${mode.toString(8)}`);
        } catch {
          return { status: "INFO", detail: "/etc/shadow not found", recommendation: "No action needed" };
        }
      },
    },
    {
      name: "Panel Runs as Non-root",
      controls: { soc2: "CC6.3", iso: "A.8.2" },
      run: async () =>
        process.getuid?.() === 0
          ? { status: "WARN", detail: "clau-ai is running as root", recommendation: "Run the panel as the site owner user (see README → Deploy)" }
          : ok(`Running as uid ${process.getuid?.()}`),
    },
  ];
}

export async function runCompliance(framework: Framework): Promise<ScanReport> {
  const started = Date.now();
  const procs = await runningProcesses();
  const checks = buildChecks(procs);

  const results: CheckResult[] = await Promise.all(
    checks.map(async (c) => {
      const refs =
        framework === "soc2" ? `SOC 2 ${c.controls.soc2}` : framework === "iso27001" ? `ISO ${c.controls.iso}` : `SOC 2 ${c.controls.soc2} · ISO ${c.controls.iso}`;
      try {
        const r = await c.run();
        return { check: c.name, status: r.status, detail: `${r.detail} [${refs}]`, recommendation: r.recommendation };
      } catch (err) {
        return { check: c.name, status: "INFO" as const, detail: `Check failed: ${(err as Error).message} [${refs}]`, recommendation: "Run the check again" };
      }
    }),
  );

  return { scanner: "compliance", target: framework, durationMs: Date.now() - started, results };
}
