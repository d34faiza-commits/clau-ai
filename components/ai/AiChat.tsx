"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Brush,
  Check,
  Cpu,
  Eye,
  EyeOff,
  Fish,
  Gem,
  Globe,
  Loader2,
  MessageSquare,
  Monitor,
  Network,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import MessageContent from "@/components/ai/MessageContent";
import RadarLoader from "@/components/ai/RadarLoader";
import { getProvider, PROVIDERS, type ChatMessage, type ProviderId, type PublicAiConfig } from "@/lib/ai/providers";

const ICONS: Record<ProviderId, LucideIcon> = {
  openai: Sparkles,
  claude: MessageSquare,
  deepseek: Fish,
  grok: Zap,
  perplexity: Globe,
  gemini: Gem,
  ollama: Cpu,
  lmstudio: Monitor,
  gateway: Network,
};

const GREETING: ChatMessage = {
  role: "assistant",
  content: "Hello! I'm clau-ai assistant. I help with Linux/PHP server administration. What do you need?",
};

type Status = { type: "info" | "success" | "error"; text: string } | null;

// Chat history survives page navigation within the tab, and is gone when the tab closes.
const HISTORY_KEY = "clauai-chat";

export default function AiChat() {
  const [config, setConfig] = useState<PublicAiConfig | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // configuration form
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [manualModel, setManualModel] = useState(false);
  const [manualValue, setManualValue] = useState("");

  // chat
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const preset = getProvider(provider)!;
  const savedForThisProvider = config?.provider === provider;

  const loadModels = useCallback(async () => {
    setLoadingModels(true);
    try {
      const res = await fetch("/api/ai/models", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setModels(data.models);
    } catch (err) {
      setStatus({ type: "error", text: (err as Error).message });
    } finally {
      setLoadingModels(false);
    }
  }, []);

  // initial config
  useEffect(() => {
    fetch("/api/ai/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((cfg: PublicAiConfig) => {
        setConfig(cfg);
        if (cfg.provider) {
          setProvider(cfg.provider);
          setBaseUrl(cfg.baseUrl);
          loadModels();
        } else {
          setBaseUrl(getProvider("claude")!.baseUrl);
        }
        setPanelOpen(!cfg.connected);
      })
      .catch(() => setPanelOpen(true));
  }, [loadModels]);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "null");
      if (Array.isArray(saved) && saved.length) setMessages([GREETING, ...saved]);
    } catch {
      // storage unavailable — start fresh
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.filter((m) => m !== GREETING)));
    } catch {
      // storage unavailable or full — history just won't persist
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const chooseProvider = (id: ProviderId) => {
    setProvider(id);
    setApiKey("");
    setStatus(null);
    setManualModel(false);
    const isSaved = config?.provider === id;
    setBaseUrl(isSaved ? config!.baseUrl : getProvider(id)!.baseUrl);
    setModels(isSaved ? models : []);
  };

  const saveAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus({ type: "info", text: "Saving credentials…" });
    try {
      const res = await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, baseUrl, apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data.config);
      setApiKey("");
      setModels(data.models);
      if (data.modelsError) {
        setStatus({ type: "error", text: `Credentials saved, but loading models failed: ${data.modelsError}` });
        setManualModel(true);
      } else {
        setManualModel(false);
        setStatus({ type: "success", text: `Credentials saved — ${data.models.length} models available` });
      }
    } catch (err) {
      setStatus({ type: "error", text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const selectModel = async (model: string) => {
    if (!model.trim()) return;
    try {
      const res = await fetch("/api/ai/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, baseUrl, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfig(data.config);
      setStatus({ type: "success", text: `Connected to ${preset.label} / ${model}` });
    } catch (err) {
      setStatus({ type: "error", text: (err as Error).message });
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setChatError(null);
    setSending(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // the greeting is UI-only; the API expects the conversation to start with the user
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setChatError((err as Error).message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const retry = () => {
    // resend the last user message after an error
    const last = messages[messages.length - 1];
    if (last?.role !== "user") return;
    setMessages(messages.slice(0, -1));
    setInput(last.content);
    setChatError(null);
  };

  const clearChat = () => {
    setMessages([GREETING]);
    setChatError(null);
  };

  const connected = !!config?.connected;
  const field =
    "w-full rounded-md border border-base-border bg-base px-3 py-2 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent-green/50";

  return (
    <div className="mx-auto flex h-[calc(100vh-5rem)] max-w-7xl flex-col gap-4 md:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)]">
      <header className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-accent-green" />
        <h1 className="text-xl font-semibold text-slate-100">AI Chat</h1>
      </header>

      {/* Connection status */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-base-border bg-base-panel px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-slate-200">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "bg-accent-green shadow-[0_0_6px_#22c55e]" : "bg-amber-400 shadow-[0_0_6px_#fbbf24]"
            }`}
          />
          {config === null ? "Loading…" : connected ? "Connected" : "Not configured"}
        </span>
        {connected && (
          <span className="max-w-full truncate rounded-md border border-base-border bg-base px-2 py-0.5 font-mono text-xs text-slate-400">
            {getProvider(config!.provider!)?.label} / {config!.model}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              panelOpen
                ? "border-accent-green/40 text-accent-green"
                : "border-base-border text-slate-300 hover:border-slate-600"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Configure
          </button>
          <button
            type="button"
            onClick={clearChat}
            title="Clear chat"
            className="rounded-md border border-base-border px-2.5 py-1.5 text-slate-300 hover:border-slate-600"
          >
            <Brush className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Configuration panel */}
      {panelOpen && (
        <form
          onSubmit={saveAndConnect}
          className="max-h-[55vh] shrink-0 space-y-4 overflow-y-auto rounded-xl border border-base-border bg-base-panel p-4"
        >
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Provider</p>
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((p) => {
                const Icon = ICONS[p.id];
                const active = p.id === provider;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => chooseProvider(p.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "border-accent-green bg-accent-green/15 text-accent-green"
                        : "border-base-border bg-base text-slate-400 hover:border-slate-600 hover:text-slate-200"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {preset.editableBaseUrl && (
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                <Network className="h-3.5 w-3.5 text-fuchsia-400" />
                {preset.id === "gateway" ? "Gateway Base URL" : "Base URL"}
              </span>
              <input
                className={field}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://your-gateway.example.com/v1"
                required
              />
              <span className="mt-1 block text-xs text-slate-500">{preset.hint}</span>
            </label>
          )}

          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              API Key {preset.needsKey ? "(required)" : "(optional)"}
            </span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <input
                  className={`${field} pr-10`}
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  placeholder={
                    savedForThisProvider && config?.hasKey ? `Saved (${config.keyHint}) — leave empty to keep` : "Paste your API key"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center justify-center gap-2 rounded-md border border-accent-green/50 bg-accent-green/15 px-4 py-2 text-sm font-semibold text-accent-green hover:bg-accent-green/25 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save &amp; Connect
              </button>
            </div>
            {!preset.editableBaseUrl && <span className="mt-1 block text-xs text-slate-500">{preset.hint}</span>}
            <span className="mt-1 block text-xs text-slate-600">
              Stored only on this server (data/ai-config.json, mode 600) — never sent back to the browser.
            </span>
          </div>

          {status && (
            <p
              className={`flex items-center gap-1.5 text-sm ${
                status.type === "error" ? "text-red-400" : status.type === "success" ? "text-accent-green" : "text-slate-400"
              }`}
            >
              {status.type === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0" />
              ) : status.type === "success" ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              )}
              {status.text}
            </p>
          )}

          {savedForThisProvider && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Model</span>
                <button
                  type="button"
                  onClick={loadModels}
                  disabled={loadingModels}
                  className="flex items-center gap-1.5 rounded-md border border-base-border px-2.5 py-1 text-xs text-slate-300 hover:border-slate-600"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingModels ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {manualModel || models.length === 0 ? (
                <div className="flex gap-2">
                  <input
                    className={field}
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    placeholder={config?.model || preset.suggestedModels[0] || "model-id"}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        selectModel(manualValue);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => selectModel(manualValue)}
                    className="rounded-md bg-accent-green px-4 text-sm font-semibold text-slate-900 hover:bg-green-400"
                  >
                    Use
                  </button>
                </div>
              ) : (
                <select
                  size={Math.min(6, Math.max(3, models.length))}
                  value={config?.model ?? ""}
                  onChange={(e) => selectModel(e.target.value)}
                  className="w-full rounded-md border border-base-border bg-base p-1 font-mono text-sm text-slate-200 outline-none focus:border-accent-green/50 [&>option:checked]:bg-accent-blue/40 [&>option]:rounded [&>option]:px-2 [&>option]:py-0.5"
                >
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {models.length > 0 && (
                  <>
                    <Check className="mr-1 inline h-3 w-3 text-accent-green" />
                    {models.length} models — click one to connect ·{" "}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setManualModel((m) => !m)}
                  className="text-fuchsia-400 underline-offset-2 hover:underline"
                >
                  {manualModel ? "pick from list" : "type manually"}
                </button>
              </p>
            </div>
          )}

          {provider === "gateway" && (
            <p className="rounded-md border border-base-border bg-base px-3 py-2 text-xs text-slate-400">
              <Network className="mr-1 inline h-3.5 w-3.5 text-fuchsia-400" />
              Single endpoint routing to <b className="text-slate-200">60+ AI providers</b> — Claude, GPT, Gemini, DeepSeek,
              Grok, Qwen and more — with automatic fallback.
            </p>
          )}
        </form>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border border-base-border bg-base-panel/60 p-4"
      >
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end gap-3">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent-green/15 px-4 py-2.5 text-sm text-slate-100 ring-1 ring-accent-green/30">
                <MessageContent content={m.content} />
              </div>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-green/20 text-accent-green">
                <User className="h-4 w-4" />
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700/60 text-accent-green">
                <Bot className="h-4 w-4" />
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-800/80 px-4 py-2.5 text-sm text-slate-200 ring-1 ring-base-border">
                <MessageContent content={m.content} />
              </div>
            </div>
          ),
        )}

        {sending && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700/60 text-accent-green">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-slate-800/80 px-4 py-2.5 ring-1 ring-base-border">
              <RadarLoader />
            </div>
          </div>
        )}

        {chatError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{chatError}</span>
            <button type="button" onClick={retry} className="shrink-0 text-xs underline underline-offset-2 hover:text-red-200">
              Edit &amp; retry
            </button>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 rounded-xl border border-base-border bg-base-panel p-2 focus-within:border-accent-green/50"
      >
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // auto-grow up to ~8 lines
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={connected ? "Ask anything..." : "Ask anything... (configure a provider first)"}
          className="max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-green text-slate-900 transition-colors hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
