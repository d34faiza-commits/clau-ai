import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiConfig } from "./config";
import { getProvider, type ChatMessage } from "./providers";

export const SYSTEM_PROMPT = `You are clau-ai assistant, built into the clau-ai web server control panel.
You help administrators with Linux server administration, PHP, web servers (LiteSpeed, Nginx, Apache),
databases (MySQL/MariaDB), security hardening and troubleshooting.
Give practical, copy-pasteable commands in fenced code blocks, explain what they do, and warn before
anything destructive (deleting data, restarting services, changing firewall rules). Be concise.`;

const MAX_TOKENS = 16000;
const CHAT_TIMEOUT_MS = 180_000;

// Models that accept the server-side refusal fallback ("default" routes by refusal category).
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export class AiError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

function anthropicClient(cfg: AiConfig) {
  return new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl, timeout: CHAT_TIMEOUT_MS, maxRetries: 1 });
}

function anthropicError(err: unknown): AiError {
  if (err instanceof Anthropic.AuthenticationError) return new AiError("Invalid Anthropic API key", 401);
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError("This API key has no access to that model", 403);
  if (err instanceof Anthropic.NotFoundError) return new AiError("Model not found — pick another model", 404);
  if (err instanceof Anthropic.RateLimitError) return new AiError("Rate limited by Anthropic — try again shortly", 429);
  if (err instanceof Anthropic.BadRequestError) return new AiError(`Request rejected: ${err.message}`, 400);
  if (err instanceof Anthropic.APIConnectionError) return new AiError("Could not reach api.anthropic.com", 502);
  if (err instanceof Anthropic.APIError) return new AiError(`Anthropic API error ${err.status}: ${err.message}`, 502);
  return new AiError((err as Error).message || "Unexpected error");
}

/** base + path without doubled slashes */
function endpoint(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

async function openAiRequest(cfg: AiConfig, path: string, init: RequestInit, timeoutMs: number) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  let res: Response;
  try {
    res = await fetch(endpoint(cfg.baseUrl, path), { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const name = (err as Error).name;
    throw new AiError(
      name === "TimeoutError" ? "The provider did not respond in time" : `Could not connect to ${cfg.baseUrl}`,
      504,
    );
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    // non-JSON error page
  }
  if (!res.ok) {
    const apiMessage =
      (data as { error?: { message?: string } | string })?.error &&
      (typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : (data as { error: { message?: string } }).error.message);
    if (res.status === 401 || res.status === 403) throw new AiError(apiMessage || "Invalid API key", 401);
    throw new AiError(apiMessage || `Provider returned HTTP ${res.status}`, res.status === 404 ? 404 : 502);
  }
  return data;
}

export async function listModels(cfg: AiConfig): Promise<string[]> {
  const provider = getProvider(cfg.provider);
  if (!provider) throw new AiError("Unknown provider", 400);

  if (provider.kind === "anthropic") {
    try {
      const ids: string[] = [];
      for await (const model of anthropicClient(cfg).models.list({ limit: 100 })) ids.push(model.id);
      return ids;
    } catch (err) {
      throw anthropicError(err);
    }
  }

  try {
    const data = (await openAiRequest(cfg, "/models", { method: "GET" }, 15_000)) as { data?: { id: string }[] };
    const ids = (data?.data ?? []).map((m) => m.id).filter(Boolean);
    return ids.length ? ids.sort() : provider.suggestedModels;
  } catch (err) {
    // Some providers (e.g. Perplexity) have no model-list endpoint; offer suggestions instead.
    if (err instanceof AiError && err.status === 404 && provider.suggestedModels.length) return provider.suggestedModels;
    throw err;
  }
}

export async function chat(cfg: AiConfig, messages: ChatMessage[]): Promise<string> {
  const provider = getProvider(cfg.provider);
  if (!provider) throw new AiError("Unknown provider", 400);

  if (provider.kind === "anthropic") {
    const client = anthropicClient(cfg);
    try {
      const response = FALLBACK_MODELS.has(cfg.model)
        ? await client.beta.messages.create({
            model: cfg.model,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            messages,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          })
        : await client.messages.create({ model: cfg.model, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages });

      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
      if (response.stop_reason === "refusal") {
        return text || "The model declined to answer this request. Try rephrasing it.";
      }
      if (response.stop_reason === "max_tokens") return `${text}\n\n_(Response truncated: output limit reached.)_`;
      return text || "(empty response)";
    } catch (err) {
      throw anthropicError(err);
    }
  }

  const data = (await openAiRequest(
    cfg,
    "/chat/completions",
    {
      method: "POST",
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: false,
      }),
    },
    CHAT_TIMEOUT_MS,
  )) as { choices?: { message?: { content?: string } }[] };

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new AiError("The provider returned an unexpected response");
  return content.trim() || "(empty response)";
}
