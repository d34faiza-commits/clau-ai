// Shared between the security API (server) and UI (client).

export type CheckStatus = "PASS" | "FAIL" | "WARN" | "INFO";

export type CheckResult = {
  check: string;
  status: CheckStatus;
  detail: string;
  recommendation: string;
};

export type ScanReport = {
  scanner: string;
  target?: string;
  durationMs: number;
  scannedFiles?: number;
  truncated?: boolean;
  results: CheckResult[];
};

export const SCANNERS = ["permissions", "credentials", "webshell", "phpini", "compliance"] as const;
export type ScannerId = (typeof SCANNERS)[number];

export const FRAMEWORKS = {
  both: "SOC 2 + ISO 27001",
  soc2: "SOC 2",
  iso27001: "ISO 27001",
} as const;
export type Framework = keyof typeof FRAMEWORKS;
