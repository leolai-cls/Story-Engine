/**
 * Phase 8 · Image generation client · OpenRouter aggregator.
 *
 * Single client · 3-model routing (Q3 founder-locked):
 *   - SFW illustration / wallpaper → google/gemini-2.5-flash-image
 *   - SFW comic (native CJK text rendering) → openai/gpt-image-1
 *   - Adult-rated story → x-ai/grok-2-image
 *
 * All routed through OpenRouter (existing OPENROUTER_API_KEY reuse · 0 new
 * env vars). Provider abstraction mirrors lib/ai/providers.ts pattern.
 *
 * Why generic fetch (not @ai-sdk/openai images): OpenRouter image gen
 * endpoint is /api/v1/images/generations (OpenAI-compatible) but the
 * provider SDK doesn't expose `.images.generate` directly with our header
 * stack (HTTP-Referer + X-Title required for OR billing routing).
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
 * Per Phase 8 plan Q3 + Q5.
 */
export function pickImageModel(
  contentRating: "sfw" | "soft" | "adult",
  imageType: ImageType,
): string {
  if (contentRating === "adult") return "x-ai/grok-2-image";
  if (imageType === "comic") return "openai/gpt-image-1";
  return "google/gemini-2.5-flash-image";
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
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "config_error",
      message: "OPENROUTER_API_KEY not set",
    };
  }

  const modelId = pickImageModel(req.contentRating, req.imageType);
  const provider = `openrouter:${modelId}`;

  // OpenRouter image gen body shape · OpenAI-compatible
  // (see https://openrouter.ai/docs/api-reference/image-generation)
  const body: Record<string, unknown> = {
    model: modelId,
    prompt: req.prompt,
    size: `${req.width}x${req.height}`,
    n: 1,
    response_format: "b64_json",
  };

  // Reference images (style + character) · OpenAI-compatible providers accept
  // these as part of the prompt or as separate image[] inputs. OpenRouter
  // proxies these to provider-specific param shape. Pass as URLs in
  // metadata · provider docs say `image_url` array works for Gemini/GPT.
  const referenceUrls = [
    ...(req.styleReferenceUrl ? [req.styleReferenceUrl] : []),
    ...(req.characterReferenceUrls ?? []),
  ].slice(0, 4); // most providers cap at 3-4 references
  if (referenceUrls.length > 0) {
    body.reference_images = referenceUrls;
  }
  if (req.negativePrompt) {
    body.negative_prompt = req.negativePrompt;
  }

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          process.env.NEXT_PUBLIC_APP_URL ??
          process.env.NEXT_PUBLIC_SITE_URL ??
          "https://kieio.com",
        "X-Title": "Kieio",
      },
      body: JSON.stringify(body),
      // Long timeout · image gen can take 5-25s
      signal: AbortSignal.timeout(60_000),
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

    // Map common errors
    if (
      response.status === 400 ||
      errType.includes("content_filter") ||
      errType.includes("safety") ||
      errCode.includes("content_filter")
    ) {
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
 * Phase 8 pricing (from plan · margin 90-96%):
 *   SFW illustration (Gemini $0.04)         → 50 credits
 *   SFW comic (GPT Image low $0.04)         → 100 credits
 *   SFW comic Pro quality (GPT Image $0.17) → 200 credits (Pro tier only)
 *   SFW wallpaper (Gemini $0.04)            → 80 credits
 *   Adult illustration (Grok $0.07)         → 100 credits
 *   Adult wallpaper (Grok $0.07)            → 120 credits
 *   Character portrait (provider-matched)   → 40 credits
 */
export function estimateImageCredits(
  contentRating: "sfw" | "soft" | "adult",
  imageType: ImageType,
  proQuality: boolean = false,
): number {
  if (contentRating === "adult") {
    return imageType === "wallpaper" ? 120 : 100;
  }
  if (imageType === "illustration") return 50;
  if (imageType === "wallpaper") return 80;
  // comic
  return proQuality ? 200 : 100;
}

/** Cost to generate one character portrait. Same for all providers. */
export const CHARACTER_PORTRAIT_CREDITS = 40;
