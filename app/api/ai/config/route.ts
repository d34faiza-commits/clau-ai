import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import { AiError, listModels } from "@/lib/ai/client";
import { loadAiConfig, saveAiConfig, toPublic, type AiConfig } from "@/lib/ai/config";
import { getProvider } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

/** GET /api/ai/config — current config without the API key. */
export async function GET() {
  return NextResponse.json(toPublic(await loadAiConfig()));
}

/**
 * POST /api/ai/config — { provider, baseUrl?, apiKey?, model? }
 * Without `model` this is "Save & Connect": stores the credentials and returns the model list.
 * With only `model` it switches the active model.
 */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  const existing = await loadAiConfig();
  const provider = getProvider(body.provider ?? existing?.provider);
  if (!provider) return NextResponse.json({ error: "Choose a provider" }, { status: 400 });
  const sameProvider = existing?.provider === provider.id;

  let baseUrl = provider.baseUrl;
  if (provider.editableBaseUrl) {
    baseUrl = String(body.baseUrl ?? (sameProvider ? existing?.baseUrl : provider.baseUrl) ?? "").trim();
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      return NextResponse.json({ error: "Enter a valid http(s) Base URL" }, { status: 400 });
    }
  }

  // An empty key field keeps the saved key, so it never has to be sent back to the browser.
  const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : sameProvider ? existing!.apiKey : "";
  if (provider.needsKey && !apiKey) return NextResponse.json({ error: "API key is required" }, { status: 400 });

  const switchingModel = typeof body.model === "string";
  const cfg: AiConfig = {
    provider: provider.id,
    baseUrl,
    apiKey,
    model: switchingModel ? body.model.trim() : sameProvider && existing?.baseUrl === baseUrl ? existing.model : "",
  };

  if (switchingModel) {
    if (!cfg.model) return NextResponse.json({ error: "Model is required" }, { status: 400 });
    await saveAiConfig(cfg);
    return NextResponse.json({ config: toPublic(cfg) });
  }

  await saveAiConfig(cfg);
  try {
    const models = await listModels(cfg);
    // Preselect the recommended model when nothing is chosen yet
    if (!cfg.model && provider.suggestedModels[0] && models.includes(provider.suggestedModels[0])) {
      cfg.model = provider.suggestedModels[0];
      await saveAiConfig(cfg);
    }
    return NextResponse.json({ config: toPublic(cfg), models });
  } catch (err) {
    const message = err instanceof AiError ? err.message : "Could not load models";
    return NextResponse.json({ config: toPublic(cfg), models: [], modelsError: message });
  }
}
