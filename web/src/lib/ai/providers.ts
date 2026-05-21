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
export const openrouterProvider = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  // OpenRouter requires the OpenAI-compatible "name" header for usage routing.
  headers: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://story-engine-drab.vercel.app",
    "X-Title": "Story Engine",
  },
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

  switch (entry.provider) {
    case "anthropic":
      return anthropicProvider(entry.model_id);
    case "openrouter":
      return openrouterProvider(entry.model_id);
    case "openai":
    case "google":
    case "xai":
      // Future provider stubs — explicit failure rather than silent wrong-provider call.
      throw new Error(
        `Provider "${entry.provider}" not wired up yet (model: ${entry.id}). Phase 3 will add it.`,
      );
  }
}
