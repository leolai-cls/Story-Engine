import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { getModel, type ModelEntry } from "./models";
import type { LanguageModel } from "ai";

/**
 * Provider registry — ADR-003 (multi-LLM) + ADR-015 (Orchestrator Pattern).
 *
 * IMPORTANT: We use `createAnthropic({ baseURL })` instead of the default
 * `anthropic` import because @ai-sdk/anthropic v3.0.78 ships with a baseURL
 * that hits https://api.anthropic.com/messages (missing /v1 prefix → 404).
 * Diagnostic 2026-05-21 confirmed: direct curl /v1/messages works fine; SDK
 * default URL is broken. Explicit baseURL avoids this.
 */

export const anthropicProvider = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: "https://api.anthropic.com/v1",
});

/**
 * OpenRouter — OpenAI-compatible endpoint for adult-mode-friendly open-source
 * models per ADR-004 (Phase 6).
 *
 * AUDIT FIX (AI-H-01): Previously used `createAnthropic({baseURL: openrouter})`
 * which would 404 because OpenRouter's wire format is OpenAI-compatible, not
 * Anthropic-compatible. Switched to `createOpenAI` with the OpenRouter base URL.
 */
/**
 * W5 · 2026-05-28: custom fetch interceptor.
 *
 * Why: Gemini predefault safety filter rejects fiction 黑道 / 武俠 / 暴力 /
 * 校園衝突 等正常題材. Verified via OpenRouter Chat playground · gemini-3.5-flash
 * + 1980 九龍城寨 prompt = "provider Terms Of Service" error.
 *
 * OpenRouter docs (https://openrouter.ai/docs/api-reference/parameters) confirm:
 *   "You may send any parameters from the following list, as well as others"
 *   "We will also transmit some provider-specific parameters, such as
 *    safe_prompt for Mistral or raw_mode for Hyperbolic directly to the
 *    respective providers if specified."
 *
 * For Gemini: pass `safety_settings: [{category, threshold}]` 落 body ·
 * OpenRouter pass through 落 Google · 等 fiction 黑道 / 武俠 etc 唔再 reject.
 *
 * @ai-sdk/openai `providerOptions.openai` 唔 forward arbitrary params · 所以
 * 用 fetch interceptor: 攔截 chat completion 出去 OpenRouter 之前 · 如果係
 * Gemini route · inject `safety_settings: BLOCK_NONE` 落 body.
 */
const openrouterFetch: typeof fetch = async (input, init) => {
  // Only intercept POST /chat/completions · 唔影響其他 endpoint
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const isChatCompletion = url?.includes("/chat/completions");
  if (!isChatCompletion || !init?.body || typeof init.body !== "string") {
    return fetch(input, init);
  }
  try {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    const model = body.model as string | undefined;
    if (model && model.includes("google/gemini") && !body.safety_settings) {
      body.safety_settings = [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ];
      const newInit = { ...init, body: JSON.stringify(body) };
      return fetch(input, newInit);
    }
  } catch {
    // body 唔係 JSON · pass through 原本嘅 init
  }
  return fetch(input, init);
};

export const openrouterProvider = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  // OpenRouter requires HTTP-Referer + X-Title headers for usage routing /
  // analytics. Hard rule #35 (post-subdomain split): app origin preferred ·
  // marketing host deprecated as referrer source.
  headers: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://app.kieio.com",
    "X-Title": "Kieio",
  },
  fetch: openrouterFetch,
});

/**
 * Provider dispatcher — picks the right provider client for a given model id.
 *
 * AUDIT FIX (AI-H-09): turn route was hard-coding `anthropicProvider(pt.llm_model)`
 * even when llm_provider was openrouter/openai/etc → every non-Anthropic model
 * 404'd silently. Now: lookup model registry, dispatch by `.provider`, pass the
 * provider's actual `model_id` (not the internal Story Engine id).
 *
 * Returns a LanguageModel ready to pass to generateText / streamText / generateObject.
 */
export function getProviderModel(internalModelId: string): LanguageModel {
  let entry: ModelEntry;
  try {
    entry = getModel(internalModelId);
  } catch {
    // Unknown id — fall back to default Anthropic Sonnet rather than throwing.
    // (Schema enforces this elsewhere; this branch is a defense.)
    console.warn(`[providers] unknown model id "${internalModelId}", falling back to claude-sonnet-4-6`);
    entry = getModel("claude-sonnet-4-6");
  }

  // ADR-021: 只支援 anthropic direct + openrouter aggregator · 唔加任何其他 vendor.
  switch (entry.provider) {
    case "anthropic":
      return anthropicProvider(entry.model_id);
    case "openrouter":
      // W4 fix · 2026-05-28 (PR #4 retest root cause):
      // @ai-sdk/openai v3+ default route 用 OpenAI 新 Responses API endpoint
      // (`/v1/responses`) · OpenRouter 只支援舊 Chat Completions API
      // (`/v1/chat/completions`) · 用 `provider(modelId)` 會出
      // "Invalid Responses API request" SSE error · narrator silent fail.
      // 顯式 call `.chat(modelId)` 強制走 chat completions endpoint.
      return openrouterProvider.chat(entry.model_id);
  }
}
