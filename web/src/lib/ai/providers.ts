import { createAnthropic } from "@ai-sdk/anthropic";

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
 * models per ADR-004. Phase 6 wires this up properly.
 */
export function createOpenRouterClient(apiKey?: string) {
  return createAnthropic({
    apiKey: apiKey ?? process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  });
}
