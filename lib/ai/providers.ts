// Provider presets, shared by the AI API (server) and the AI Chat UI (client).

export type ProviderId =
  | "openai"
  | "claude"
  | "deepseek"
  | "grok"
  | "perplexity"
  | "gemini"
  | "ollama"
  | "lmstudio"
  | "gateway";

export type Provider = {
  id: ProviderId;
  label: string;
  /** "anthropic" uses the official Anthropic SDK; everything else speaks the OpenAI chat API. */
  kind: "anthropic" | "openai";
  baseUrl: string;
  /** Show the Base URL field (self-hosted or custom endpoints). */
  editableBaseUrl: boolean;
  needsKey: boolean;
  /** Suggested when the provider has no model-list endpoint or it is empty. */
  suggestedModels: string[];
  hint: string;
};

export const PROVIDERS: Provider[] = [
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    editableBaseUrl: false,
    needsKey: true,
    suggestedModels: [],
    hint: "API key from platform.openai.com",
  },
  {
    id: "claude",
    label: "Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    editableBaseUrl: false,
    needsKey: true,
    suggestedModels: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"],
    hint: "API key from platform.claude.com",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    editableBaseUrl: false,
    needsKey: true,
    suggestedModels: ["deepseek-chat", "deepseek-reasoner"],
    hint: "API key from platform.deepseek.com",
  },
  {
    id: "grok",
    label: "Grok",
    kind: "openai",
    baseUrl: "https://api.x.ai/v1",
    editableBaseUrl: false,
    needsKey: true,
    suggestedModels: [],
    hint: "API key from console.x.ai",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    kind: "openai",
    baseUrl: "https://api.perplexity.ai",
    editableBaseUrl: false,
    needsKey: true,
    suggestedModels: ["sonar", "sonar-pro", "sonar-reasoning-pro"],
    hint: "API key from perplexity.ai/settings/api",
  },
  {
    id: "gemini",
    label: "Gemini",
    kind: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    editableBaseUrl: false,
    needsKey: true,
    suggestedModels: [],
    hint: "API key from aistudio.google.com",
  },
  {
    id: "ollama",
    label: "Ollama",
    kind: "openai",
    baseUrl: "http://127.0.0.1:11434/v1",
    editableBaseUrl: true,
    needsKey: false,
    suggestedModels: [],
    hint: "Local models — run `ollama serve` on this server",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    kind: "openai",
    baseUrl: "http://127.0.0.1:1234/v1",
    editableBaseUrl: true,
    needsKey: false,
    suggestedModels: [],
    hint: "Local models — start the LM Studio server",
  },
  {
    id: "gateway",
    label: "Gateway",
    kind: "openai",
    baseUrl: "",
    editableBaseUrl: true,
    needsKey: true,
    suggestedModels: [],
    hint: "OpenAI-compatible endpoint — routes to 60+ providers",
  },
];

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** What the browser is allowed to see — never includes the API key. */
export type PublicAiConfig = {
  provider: ProviderId | null;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyHint: string;
  connected: boolean;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };
