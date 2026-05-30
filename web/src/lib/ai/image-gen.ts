/**
 * Phase 8 · Image generation client · CrazyRouter aggregator.
 *
 * ⚠️ DEFERRED (2026-05-29): founder is handling image gen separately ("圖之後再傾").
 * This file was repointed from OpenRouter → CrazyRouter for env/base/slug
 * consistency, but the CrazyRouter images API (request/response shape, whether
 * /v1/images/generations behaves identically, NSFW behaviour on grok-4-image)
 * is NOT yet verified end-to-end. Verify before re-enabling scene visualization.
 *
 * CrazyRouter image slugs (from /v1/models · 2026-05-29):
 *   - SFW illustration / wallpaper → nano-banana (Gemini Flash Image)
 *   - SFW / SFW Pro comic → gpt-image-2 (native CJK rendering)
 *   - Adult-rated story → grok-4-image (most permissive available · NSFW pending test)
 *     NOTE: CrazyRouter has NO dedicated uncensored diffusion model (no Flux/Pony/SDXL);
 *     真·露骨 adult imagery may need a separate specialist provider — founder decision.
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
 * Pick the OpenRouter model_id based on content_rating + image_type.
 * Per Phase 8 plan Q3 + Q5. Wave 3 audit fix AI-HIGH-01: adult+comic now
 * keeps GPT Image 2 routing for native CJK text rendering (Grok Imagine
 * is photorealistic-only · loses comic dialogue legibility).
 *
 * Adult+comic trade-off: GPT-5.4-image-2 doesn't support explicit NSFW.
 * If a user generates a comic of an adult-rated story, the provider may
 * content_filter explicit visuals. Acceptable for MVP (rare combo · most
 * adult-mode users want adult illustration / wallpaper, not comic).
 *
 * Founder NSFW verification pending on grok-imagine-image-quality.
 */
export function pickImageModel(
  contentRating: "sfw" | "soft" | "adult",
  imageType: ImageType,
): string {
  if (contentRating === "adult") {
    // Adult + comic: route gpt-image-2 anyway (CJK text > NSFW for comic UX)
    if (imageType === "comic") return "gpt-image-2";
    return "grok-4-image";
  }
  if (imageType === "comic") return "gpt-image-2";
  return "nano-banana";
}

/**
 * Call OpenRouter images endpoint · returns base64 PNG on success.
 *
 * Real-world rejection rate < 1% per Phase 8 plan. On content_filter
 * error · caller should refund credits + suggest user retry with
 * different style or rephrased prompt.
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

  const modelId = pickImageModel(req.contentRating, req.imageType);
  const provider = `crazyrouter:${modelId}`;

  // CrazyRouter image gen body · OpenAI-compatible /v1/images/generations.
  // 2026-05-29 (verified): do NOT send `response_format` — CrazyRouter's
  // gpt-image-2 rejects it (400 "response_format is not supported for
  // gpt-image-2; use output_format instead"), which is why comic gen failed.
  // Omitting it → CrazyRouter returns a `url` by default, which the response
  // handler below fetches → base64. Works for nano-banana / gpt-image-2 / grok.
  const body: Record<string, unknown> = {
    model: modelId,
    prompt: req.prompt,
    size: `${req.width}x${req.height}`,
    n: 1,
  };

  // Reference images (style + character) · OpenRouter proxies different
  // per-provider param shapes. Wave 3 audit fix AI-HIGH-06: we don't know
  // exactly which providers accept `reference_images` body field, so we
  // pass it best-effort. Providers that ignore it simply produce a
  // text-only result · degradation, not failure.
  const referenceUrls = [
    ...(req.styleReferenceUrl ? [req.styleReferenceUrl] : []),
    ...(req.characterReferenceUrls ?? []),
  ].slice(0, 4); // most providers cap at 3-4 references
  if (referenceUrls.length > 0) {
    body.reference_images = referenceUrls;
  }
  // Wave 3 audit fix AI-HIGH-05: only include negative_prompt for providers
  // that actually support it. Gemini/GPT/Grok image generation paths reject
  // or ignore this field · sending it caused 400 errors with some providers.
  // SD-class models would need explicit allow-list here if added later.
  // (Currently no SD model is enabled · negative_prompt always stripped.)
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
      // Long timeout · image gen can take 5-45s (Grok Imagine P99 ~35s · GPT
      // image P99 ~45s · bump to 90s for slow-but-eventual completion · AI-LOW-01)
      signal: AbortSignal.timeout(90_000),
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
    let body: { error?: { message?: string; type?: string; code?: string } } = {};
    try {
      body = await response.json();
    } catch {
      // ignore
    }
    const errMsg = body.error?.message ?? `HTTP ${response.status}`;
    const errType = body.error?.type ?? "";
    const errCode = body.error?.code ?? "";

    // Map common errors. Wave 3 audit fix AI-HIGH-03: drop blanket 400→
    // content_filter mapping (OpenRouter returns 400 for malformed body /
    // invalid model / oversized prompt too · misleads users). Detect via
    // error keywords only.
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
    // Some providers return URL instead of base64 · we'd need to fetch it
    // separately. Fallback path · for MVP we require b64_json.
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
