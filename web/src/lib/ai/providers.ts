import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { getModel, type ModelEntry } from "./models";
import type { LanguageModel } from "ai";

/**
 * Provider registry — ADR-003 (multi-LLM) + ADR-015 (Orchestrator Pattern)
 * + ADR-021 (HK founder · CrazyRouter + Anthropic direct only).
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
 * CrazyRouter — OpenAI-compatible aggregator. ADR-021 (2026-05-29) replaces
 * OpenRouter, which blocked HK-flagged accounts from US-trio models
 * (Gemini / GPT / Claude → "provider Terms of Service" 403). CrazyRouter has a
 * Hong Kong edge node + CN mirror, does NOT geo-block US-trio, permits adult
 * content, and exposes embeddings. Base URL https://crazyrouter.com/v1, bare
 * model slugs (no provider/ prefix), Chat Completions only (no Responses API).
 *
 * ── Gemini "thinking" footgun (verified 2026-05-29) ───────────────────────
 * Gemini on CrazyRouter defaults to a reasoning/thinking pass. With a normal
 * max_tokens budget it spends the ENTIRE budget on reasoning and returns EMPTY
 * prose (finish_reason="length", 0 text tokens). The fix is to disable thinking
 * via Gemini's native `thinking_config.thinking_budget=0`, passed through
 * CrazyRouter's OpenAI-compatible `extra_body` field (proven: with budget=0 the
 * model emits prose immediately, reasoning_tokens=0).
 *
 * Since thinking is now a user-facing toggle (default OFF · richer narration
 * when ON · costs more credits), we expose TWO provider instances:
 *   - crazyrouterNoThink: injects thinking_budget=0 for Gemini → fast/cheap/prose-only
 *   - crazyrouterThink:   leaves thinking on → deeper narration (opt-in)
 * GLM/GPT write prose directly for normal prompts, so the interceptor only
 * needs to special-case Gemini. Anthropic "extended thinking" is controlled
 * separately at the call site via providerOptions.anthropic.thinking.
 */
function makeCrazyrouterFetch(enableThinking: boolean): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const isChatCompletion = url?.includes("/chat/completions");
    if (!isChatCompletion || !init?.body || typeof init.body !== "string") {
      return fetch(input, init);
    }
    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      const model = (body.model as string | undefined) ?? "";
      // Gemini: disable thinking unless the user opted in, else prose comes back empty.
      if (model.includes("gemini") && !enableThinking) {
        const existingExtra = (body.extra_body as Record<string, unknown> | undefined) ?? {};
        body.extra_body = {
          ...existingExtra,
          google: { thinking_config: { thinking_budget: 0 } },
        };
        return fetch(input, { ...init, body: JSON.stringify(body) });
      }
    } catch {
      // body 唔係 JSON · pass through 原本嘅 init
    }
    return fetch(input, init);
  };
}

function makeCrazyrouter(enableThinking: boolean) {
  return createOpenAI({
    apiKey: process.env.CRAZYROUTER_API_KEY,
    baseURL: "https://crazyrouter.com/v1",
    // Identify our traffic in the CrazyRouter dashboard (optional · harmless).
    headers: { "X-Title": "Kieio" },
    fetch: makeCrazyrouterFetch(enableThinking),
  });
}

const crazyrouterNoThink = makeCrazyrouter(false);
const crazyrouterThink = makeCrazyrouter(true);

/**
 * Provider dispatcher — picks the right provider client for a given model id.
 *
 * AUDIT FIX (AI-H-09): turn route was hard-coding `anthropicProvider(pt.llm_model)`
 * even when llm_provider was non-Anthropic → every aggregator model 404'd
 * silently. Now: lookup model registry, dispatch by `.provider`, pass the
 * provider's actual `model_id` (not the internal Story Engine id).
 *
 * @param opts.thinking — when true, route CrazyRouter calls through the
 *   thinking-enabled instance (Gemini reasoning left on). Default false.
 *
 * Returns a LanguageModel ready to pass to generateText / streamText / generateObject.
 */
export function getProviderModel(
  internalModelId: string,
  opts?: { thinking?: boolean },
): LanguageModel {
  let entry: ModelEntry;
  try {
    entry = getModel(internalModelId);
  } catch {
    // Unknown id — fall back to default Anthropic Sonnet rather than throwing.
    // (Schema enforces this elsewhere; this branch is a defense.)
    console.warn(`[providers] unknown model id "${internalModelId}", falling back to claude-sonnet-4-6`);
    entry = getModel("claude-sonnet-4-6");
  }

  // ADR-021: 只支援 anthropic direct + crazyrouter aggregator · 唔加任何其他 vendor.
  switch (entry.provider) {
    case "anthropic":
      // Anthropic extended thinking is controlled at the call site via
      // providerOptions.anthropic.thinking (not the provider instance).
      return anthropicProvider(entry.model_id);
    case "crazyrouter":
      // @ai-sdk/openai v3+ defaults to the OpenAI Responses API (`/v1/responses`),
      // which CrazyRouter (Chat Completions only) does not support → would emit
      // "Invalid Responses API request". `.chat(modelId)` forces /chat/completions.
      return (opts?.thinking ? crazyrouterThink : crazyrouterNoThink).chat(entry.model_id);
  }
}
