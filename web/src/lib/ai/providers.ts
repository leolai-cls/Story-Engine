import { anthropic, createAnthropic } from "@ai-sdk/anthropic";

/**
 * Provider registry — ADR-003 (multi-LLM) + ADR-015 (Orchestrator Pattern).
 *
 * Vercel AI SDK gives us a unified `LanguageModel` interface across all
 * providers. Story Engine swaps providers per-playthrough based on user
 * choice, but the turn-runner code stays identical.
 *
 * Phase 1: Anthropic only (Narrator default = Claude Sonnet).
 * Phase 3: Add OpenAI, Google, xAI direct providers.
 * Phase 6: OpenRouter route for adult-mode-only (non-banning) providers.
 */

// Anthropic — uses ANTHROPIC_API_KEY env var
export const anthropicProvider = anthropic;

// Custom Anthropic instance with explicit baseURL if needed (e.g., proxy)
export function createAnthropicClient(apiKey?: string) {
  return createAnthropic({
    apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
  });
}

/**
 * OpenRouter — OpenAI-compatible endpoint, used for adult-mode-friendly
 * open-source models per ADR-004. Phase 6 wires this up properly.
 * For now exposed as factory only.
 */
export function createOpenRouterClient(apiKey?: string) {
  return createAnthropic({
    apiKey: apiKey ?? process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  });
}
