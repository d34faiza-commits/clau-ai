import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProvider, type ProviderId, type PublicAiConfig } from "./providers";

/** Stored server-side only (data/ai-config.json, mode 600). The key never reaches the browser. */
export type AiConfig = {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
};

const DATA_DIR = path.resolve(process.env.DATA_DIR || "data");
const CONFIG_FILE = path.join(DATA_DIR, "ai-config.json");

export async function loadAiConfig(): Promise<AiConfig | null> {
  try {
    const cfg = JSON.parse(await readFile(CONFIG_FILE, "utf8")) as AiConfig;
    return getProvider(cfg.provider) ? cfg : null;
  } catch {
    return null;
  }
}

export async function saveAiConfig(cfg: AiConfig): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function isConnected(cfg: AiConfig | null): boolean {
  if (!cfg || !cfg.model || !cfg.baseUrl) return false;
  const provider = getProvider(cfg.provider);
  return !!provider && (!provider.needsKey || !!cfg.apiKey);
}

export function toPublic(cfg: AiConfig | null): PublicAiConfig {
  if (!cfg) return { provider: null, baseUrl: "", model: "", hasKey: false, keyHint: "", connected: false };
  return {
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    hasKey: !!cfg.apiKey,
    // only reveal a hint when the key is long enough that it gives nothing away
    keyHint: cfg.apiKey.length >= 16 ? `${cfg.apiKey.slice(0, 3)}…${cfg.apiKey.slice(-4)}` : cfg.apiKey ? "••••" : "",
    connected: isConnected(cfg),
  };
}
