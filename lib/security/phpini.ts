import "server-only";
import type { CheckResult, ScanReport } from "./types";
import { phpIni, phpSupportStatus } from "./host";

const DANGEROUS_FUNCTIONS = ["exec", "system", "shell_exec", "passthru", "proc_open", "popen", "pcntl_exec"];

const on = (v: string | false | undefined) => v === "1" || String(v).toLowerCase() === "on";

export async function auditPhpIni(): Promise<ScanReport> {
  const started = Date.now();
  const ini = await phpIni();
  if (!ini) {
    return {
      scanner: "phpini",
      durationMs: Date.now() - started,
      results: [
        {
          check: "PHP CLI available",
          status: "FAIL",
          detail: `Could not run ${process.env.PHP_BINARY || "php"}`,
          recommendation: "Install PHP CLI or set PHP_BINARY in .env (e.g. /usr/local/lsws/lsphp82/bin/php)",
        },
      ],
    };
  }

  const v = ini.values;
  const disabled = String(v.disable_functions || "")
    .split(",")
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
  const missing = DANGEROUS_FUNCTIONS.filter((f) => !disabled.includes(f));
  const support = phpSupportStatus(ini.version);

  const bool = (
    key: string,
    want: boolean,
    failStatus: "FAIL" | "WARN",
    why: string,
  ): CheckResult => {
    const isOn = on(v[key]);
    return {
      check: `${key} = ${want ? "On" : "Off"}`,
      status: isOn === want ? "PASS" : failStatus,
      detail: `Current: ${isOn ? "On" : "Off"}. ${why}`,
      recommendation: isOn === want ? "No action needed" : `Set ${key} = ${want ? "On" : "Off"} in php.ini`,
    };
  };

  const results: CheckResult[] = [
    {
      check: "PHP version supported",
      status: support.status,
      detail: `${ini.version} — ${support.note}`,
      recommendation: support.status === "PASS" ? "Keep PHP updated" : "Upgrade to PHP 8.3 or newer",
    },
    bool("expose_php", false, "WARN", "Leaks the PHP version in the X-Powered-By header."),
    bool("display_errors", false, "FAIL", "Errors shown to visitors can reveal paths and credentials."),
    bool("display_startup_errors", false, "WARN", "Startup errors can leak configuration details."),
    bool("log_errors", true, "WARN", "Errors should be logged for incident investigation."),
    bool("allow_url_include", false, "FAIL", "Allows remote file inclusion (RFI) attacks."),
    bool("allow_url_fopen", false, "WARN", "Lets file functions fetch remote URLs (SSRF risk)."),
    bool("enable_dl", false, "WARN", "Allows loading PHP extensions at runtime."),
    {
      check: "disable_functions",
      status: missing.length ? "WARN" : "PASS",
      detail: missing.length ? `Not disabled: ${missing.join(", ")}` : "Shell execution functions are disabled",
      recommendation: missing.length
        ? `Add to php.ini: disable_functions = ${DANGEROUS_FUNCTIONS.join(",")} (verify your apps do not need them)`
        : "No action needed",
    },
    {
      check: "open_basedir",
      status: v.open_basedir ? "PASS" : "WARN",
      detail: v.open_basedir ? `Restricted to: ${v.open_basedir}` : "Not set — PHP can read any file the user can",
      recommendation: v.open_basedir ? "No action needed" : "Set open_basedir to the site directory and /tmp per site",
    },
    bool("session.cookie_httponly", true, "WARN", "Prevents JavaScript from reading the session cookie."),
    bool("session.cookie_secure", true, "WARN", "Sends the session cookie over HTTPS only."),
    bool("session.use_strict_mode", true, "WARN", "Rejects uninitialized session IDs (session fixation)."),
    {
      check: "session.cookie_samesite",
      status: v["session.cookie_samesite"] ? "PASS" : "WARN",
      detail: v["session.cookie_samesite"] ? `Current: ${v["session.cookie_samesite"]}` : "Not set",
      recommendation: v["session.cookie_samesite"] ? "No action needed" : "Set session.cookie_samesite = Lax",
    },
  ];

  return {
    scanner: "phpini",
    target: ini.iniFile ? String(ini.iniFile) : "(no php.ini loaded — PHP defaults)",
    durationMs: Date.now() - started,
    results,
  };
}
