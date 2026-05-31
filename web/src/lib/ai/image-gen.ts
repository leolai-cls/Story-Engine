/**
 * Phase 8 · Image generation client · CrazyRouter aggregator.
 *
 * Model routing (founder rule 2026-05-29):
 *   - ALL images (illustration / comic / wallpaper) → gpt-image-2
 *   - ONLY NSFW (adult-rated) images → grok-4-image (gpt-image-2 can't do
 *     explicit NSFW; grok-4-image is the most permissive available)
 *
 * Verified 2026-05-29: CrazyRouter /v1/images/generations returns 200 + a `url`
 * (NOT b64_json — do NOT send response_format, gpt-image-2 400s on it). The
 * response handler below fetches that url → base64.
 *
 * Routed through CrazyRouter (CRAZYROUTER_API_KEY). Generic fetch (not
 * @ai-sdk/openai images) keeps full control over the OpenAI-compatible
 * /v1/images/generations body + reference-image fields.
 */

import type { StyleKey } from "./image-styles";

export type ImageType = "illustration" | "comic" | "wallpaper";

export type ImageGenRequest = {
  /** Story content_rating · drives provider routing for NSFW */
  contentRating: "sfw" | "soft" | "adult";
  /** Image output type · drives provider selection for CJK text + aspect */
  imageType: ImageType;
  /** Composed prompt (style + scene + characters · see composeStyledPrompt) */
  prompt: string;
  /** Optional · provider-supported negative prompt */
  negativePrompt?: string;
  /** Optional · style reference image URL (upload mode) · NULL for preset / custom */
  styleReferenceUrl?: string | null;
  /** Optional · character reference images (lazy portraits · per-NPC face anchors) */
  characterReferenceUrls?: string[];
  /** Aspect ratio · {width, height} */
  width: number;
  height: number;
};

export type ImageGenResult =
  | {
      ok: true;
      /** base64 PNG · caller uploads to Storage */
      imageBase64: string;
      provider: string;       // 'openrouter:google/gemini-2.5-flash-image'
      modelId: string;        // 'google/gemini-2.5-flash-image'
      promptUsed: string;
    }
  | {
      ok: false;
      reason:
        | "provider_unavailable"
        | "content_filter"
        | "rate_limited"
        | "config_error"
        | "unknown";
      message: string;
      provider?: string;
      modelId?: string;
    };

/**
 * Pick a CrazyRouter image model chain (primary + optional fallback).
 *
 * Founder rule revision (2026-06-01 — replaces the 2026-05-29 "all gpt-image-2"
 * rule, after gpt-image-2 started timing out at 90s for everyone): use the
 * SLOW model only where its strength (CJK text-in-image) matters, and use the
 * FAST model everywhere else. Always have a fallback so a transient provider
 * outage on one model doesn't kill all image gen.
 *
 *   illustration / wallpaper  →  nano-banana-2   (3-10s · newer Gemini Flash Image · $0.037)
 *                                 fallback: gpt-image-2 (cross-provider resilience)
 *   comic                     →  gpt-image-2     (30-90s · best CJK in-image text · $0.038)
 *                                 fallback: nano-banana-pro (premium Gemini · best CJK fallback · $0.074)
 *   adult (any imageType)     →  grok-4-image    (only NSFW-capable, no fallback)
 *
 * Model picks 2026-06-01 (founder): use the upgraded Google Gemini family
 * (nano-banana-2 standard · nano-banana-pro premium) instead of the basic
 * nano-banana ($0.021) — the small COGS gain isn't worth the visible quality
 * drop on a paid platform. gpt-image-2 stays primary for comic (CJK in-image
 * text) until a better-CJK model is verified · qwen-image-max and
 * doubao-seedream-4-5 are candidates for a future test pass.
 *
 * Cross-provider fallback intentionally: Google (nano-banana-*) ↔ OpenAI
 * (gpt-image-2) sit on different upstream infrastructures, so a CrazyRouter
 * routing failure on one provider doesn't take both down. grok-4-image has no
 * peer for adult content, so adult never falls back.
 */
export type ImageModelChain = {
  primary: string;
  fallback?: string;
};

export function pickImageModelChain(
  contentRating: "sfw" | "soft" | "adult",
  imageType: ImageType,
): ImageModelChain {
  if (contentRating === "adult") return { primary: "grok-4-image" };
  if (imageType === "comic") {
    // Comic has CJK speech bubbles → gpt-image-2 leads · premium Gemini fallback
    return { primary: "gpt-image-2", fallback: "nano-banana-pro" };
  }
  // illustration / wallpaper: no CJK in-image text → fast Google Gemini leads
  return { primary: "nano-banana-2", fallback: "gpt-image-2" };
}

/**
 * Backwards-compat thin wrapper (still imported by visualize-actions.ts).
 * Returns the primary model only — fallback is handled inside generateSceneImage.
 */
export function pickImageModel(
  contentRating: "sfw" | "soft" | "adult",
  imageType: ImageType,
): string {
  return pickImageModelChain(contentRating, imageType).primary;
}

/**
 * Per-model fetch timeout. Google Gemini family (nano-banana-*) finishes in
 * seconds · gpt-image-2 has been timing out at 90s lately (P99 closer to
 * 120-180s) · grok needs medium. Lambda ceiling is 300s (page.tsx maxDuration),
 * so chain primary(180) + fallback(90) + upload/DB(~15) = ~285s · inside budget.
 */
function timeoutMsFor(modelId: string): number {
  if (modelId === "nano-banana-2") return 60_000;
  if (modelId === "nano-banana-pro") return 90_000; // premium may be slower
  if (modelId === "nano-banana") return 60_000; // legacy fallback ref
  if (modelId === "grok-4-image") return 120_000;
  return 180_000; // gpt-image-2 + anything else (bumped from 90s · 2026-06-01)
}

/**
 * Generate a scene image · primary model + automatic fallback on transient failure.
 *
 * Real-world rejection rate < 1% per Phase 8 plan. On content_filter error ·
 * caller should refund credits + suggest user retry with different style or
 * rephrased prompt. On provider_unavailable / rate_limited from the primary,
 * we automatically retry with the fallback model from pickImageModelChain ·
 * gives the user a chance even when one CrazyRouter upstream is down.
 */
export async function generateSceneImage(
  req: ImageGenRequest,
): Promise<ImageGenResult> {
  const apiKey = process.env.CRAZYROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "config_error",
      message: "CRAZYROUTER_API_KEY not set",
    };
  }

  const chain = pickImageModelChain(req.contentRating, req.imageType);

  // Try primary
  const primaryResult = await callImageProvider(apiKey, chain.primary, req);
  if (primaryResult.ok) return primaryResult;

  // Only fall back on TRANSIENT failures · don't retry on content_filter (the
  // content is the issue, not the provider) or config_error / unknown (deeper
  // problem · let the signal surface).
  const shouldFallback =
    !!chain.fallback &&
    (primaryResult.reason === "provider_unavailable" ||
      primaryResult.reason === "rate_limited");
  if (!shouldFallback) return primaryResult;

  console.warn(
    `[scene-image] primary ${chain.primary} failed (${primaryResult.reason}: ${primaryResult.message}) · trying fallback ${chain.fallback}`,
  );
  const fallbackResult = await callImageProvider(
    apiKey,
    chain.fallback!,
    req,
  );
  if (fallbackResult.ok) {
    console.log(
      `[scene-image] fallback ${chain.fallback} succeeded after primary ${chain.primary} failed`,
    );
  }
  return fallbackResult;
}

/**
 * Single-model image-gen call · POSTs to CrazyRouter /v1/images/generations
 * with per-model timeout. On success returns base64 PNG · on failure returns
 * a typed error so the orchestrator can decide whether to fall back.
 */
async function callImageProvider(
  apiKey: string,
  modelId: string,
  req: ImageGenRequest,
): Promise<ImageGenResult> {
  const provider = `crazyrouter:${modelId}`;

  // CrazyRouter image gen body · OpenAI-compatible /v1/images/generations.
  // 2026-05-29 (verified): do NOT send `response_format` — CrazyRouter's
  // gpt-image-2 rejects it (400 "response_format is not supported for
  // gpt-image-2; use output_format instead"). Omitting it → CrazyRouter
  // returns a `url` which we then fetch → base64. Same shape works across
  // nano-banana-2 · nano-banana-pro · gpt-image-2 · grok-4-image.
  const body: Record<string, unknown> = {
    model: modelId,
    prompt: req.prompt,
    size: `${req.width}x${req.height}`,
    n: 1,
  };

  // Reference images (style + character) · best-effort. Providers that ignore
  // the field produce a text-only result · degradation, not failure.
  const referenceUrls = [
    ...(req.styleReferenceUrl ? [req.styleReferenceUrl] : []),
    ...(req.characterReferenceUrls ?? []),
  ].slice(0, 4);
  if (referenceUrls.length > 0) {
    body.reference_images = referenceUrls;
  }
  // negative_prompt intentionally dropped · Gemini / GPT / Grok image paths
  // reject or ignore it; SD-class models would need an explicit allow-list.
  void req.negativePrompt;

  let response: Response;
  try {
    response = await fetch("https://crazyrouter.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Kieio",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMsFor(modelId)),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: msg.includes("aborted") ? "provider_unavailable" : "unknown",
      message: `image gen fetch failed: ${msg}`,
      provider,
      modelId,
    };
  }

  if (!response.ok) {
    let errBody: {
      error?: { message?: string; type?: string; code?: string };
    } = {};
    try {
      errBody = await response.json();
    } catch {
      // ignore
    }
    const errMsg = errBody.error?.message ?? `HTTP ${response.status}`;
    const errType = errBody.error?.type ?? "";
    const errCode = errBody.error?.code ?? "";

    // Map common errors via keyword detection (Wave 3 fix AI-HIGH-03 ·
    // drop blanket 400→content_filter mapping · CrazyRouter returns 400 for
    // malformed body / invalid model / oversized prompt too).
    const errBlob = `${errType} ${errCode} ${errMsg}`.toLowerCase();
    const isContentFilter =
      errBlob.includes("content_filter") ||
      errBlob.includes("safety") ||
      errBlob.includes("content_policy_violation") ||
      errBlob.includes("image_generation_user_error") ||
      errBlob.includes("policy") ||
      errBlob.includes("nsfw") ||
      errBlob.includes("csam") ||
      errBlob.includes("minor");
    if (isContentFilter) {
      return {
        ok: false,
        reason: "content_filter",
        message: errMsg,
        provider,
        modelId,
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        reason: "rate_limited",
        message: errMsg,
        provider,
        modelId,
      };
    }
    return {
      ok: false,
      reason: "provider_unavailable",
      message: `${response.status}: ${errMsg}`,
      provider,
      modelId,
    };
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    revised_prompt?: string;
  };

  const firstImage = data.data?.[0];
  if (!firstImage?.b64_json) {
    // URL-style response · fetch then base64-encode.
    if (firstImage?.url) {
      try {
        const imgResponse = await fetch(firstImage.url, {
          signal: AbortSignal.timeout(30_000),
        });
        if (imgResponse.ok) {
          const buffer = await imgResponse.arrayBuffer();
          const base64 = Buffer.from(buffer).toString("base64");
          return {
            ok: true,
            imageBase64: base64,
            provider,
            modelId,
            promptUsed: req.prompt,
          };
        }
      } catch {
        // fall through
      }
    }
    return {
      ok: false,
      reason: "provider_unavailable",
      message: "Provider returned no image data",
      provider,
      modelId,
    };
  }

  return {
    ok: true,
    imageBase64: firstImage.b64_json,
    provider,
    modelId,
    promptUsed: req.prompt,
  };
}

/**
 * Estimate credits to charge per image gen.
 *
 * Wave 3 audit (2026-05-28) verified real OpenRouter cost:
 *   Gemini 2.5 Flash Image: token-based ~$0.005/image
 *   GPT-5.4-image-2:        token-based ~$0.024/image (Pro ~$0.045)
 *   Grok Imagine:           $0.05/image flat
 *
 * Pricing (margin 50-90%):
 *   SFW illustration (Gemini $0.005)        → 50 credits ($0.05) · 90% margin
 *   SFW wallpaper (Gemini $0.005)           → 80 credits ($0.08) · 94% margin
 *   SFW comic (GPT-5.4-image-2 $0.024)      → 100 credits ($0.10) · 76% margin
 *   SFW comic Pro (GPT-5.4-image-2 $0.045)  → 200 credits ($0.20) · 78% margin
 *   Adult illustration (Grok Imagine $0.05) → 100 credits ($0.10) · 50% margin
 *   Adult wallpaper (Grok Imagine $0.05)    → 120 credits ($0.12) · 58% margin
 *   Adult comic (GPT-5.4-image-2 · routed)  → 200 credits (Pro pricing)
 *   Character portrait (provider-matched)   → 40 credits
 */
export function estimateImageCredits(
  contentRating: "sfw" | "soft" | "adult",
  imageType: ImageType,
  proQuality: boolean = false,
): number {
  if (contentRating === "adult") {
    // Adult+comic uses GPT-5.4-image-2 Pro routing (CJK text rendering)
    if (imageType === "comic") return 200;
    return imageType === "wallpaper" ? 120 : 100;
  }
  if (imageType === "illustration") return 50;
  if (imageType === "wallpaper") return 80;
  // comic (SFW/soft)
  return proQuality ? 200 : 100;
}

/** Cost to generate one character portrait. Same for all providers. */
export const CHARACTER_PORTRAIT_CREDITS = 40;
