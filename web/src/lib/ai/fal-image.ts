/**
 * fal.ai image client (Wave 3 · 2026-06-14) — gpt-image-2 via fal's QUEUE API.
 *
 * WHY fal (not CrazyRouter) for gpt-image-2: CrazyRouter's sync image endpoint
 * cuts the connection at ~60s, and its image streaming is broken (returns 500
 * `provider_stream_incomplete` · only keepalive pings, never the image). So a
 * big high-quality character design sheet (>60s to render) can NEVER be
 * delivered through CrazyRouter. fal's queue API (submit → poll → fetch) has no
 * such cut. Verified 2026-06-14: a 1536x1024 high-quality sheet returned in ~155s
 * (well inside our 300s lambda budget · play page maxDuration).
 *
 * SFW images only. Adult / NSFW stays on Grok via CrazyRouter (hard rule #5 —
 * NSFW must never touch a US provider that would ban us; gpt-image refuses NSFW
 * anyway). Callers route by content_rating BEFORE calling this.
 *
 * Auth: `Authorization: Key <FAL_KEY>` (fal convention · NOT Bearer).
 * Cost (fal list · verified): high 1536x1024 ≈ $0.15-0.18 · medium ≈ $0.04 ·
 * low ≈ $0.005. quality drives cost massively — pick per use case.
 */

const FAL_QUEUE_BASE = "https://queue.fal.run";
const TEXT_TO_IMAGE_MODEL = "openai/gpt-image-2";
/** Image-to-image (reference / consistency) · takes image_urls. Verify before
 *  first production use — the text-to-image path above is the verified one. */
const EDIT_MODEL = "openai/gpt-image-2/edit";

export type FalImageQuality = "low" | "medium" | "high" | "auto";

export type FalImageRequest = {
  prompt: string;
  width: number;
  height: number;
  /** Drives cost: high ≈ $0.15-0.18 · medium ≈ $0.04 · low ≈ $0.005 (1536x1024). */
  quality?: FalImageQuality;
  /** Optional reference images for character consistency (image-to-image / edit). */
  referenceImageUrls?: string[];
  outputFormat?: "png" | "jpeg" | "webp";
  /** Hard ceiling for the submit+poll loop. Default 280s (fits 300s lambda). */
  timeoutMs?: number;
};

export type FalImageResult =
  | {
      ok: true;
      imageBase64: string;
      imageUrl: string;
      provider: string; // "fal:openai/gpt-image-2"
      requestId: string;
      width?: number;
      height?: number;
    }
  | {
      ok: false;
      reason:
        | "config_error"
        | "balance_exhausted"
        | "content_filter"
        | "rate_limited"
        | "timeout"
        | "provider_unavailable"
        | "unknown";
      message: string;
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Generate one image via fal gpt-image-2 (queue API). Submits the job, polls
 * status until COMPLETED, fetches the result, downloads it to base64.
 *
 * The caller is responsible for: content moderation (text prompt), credit
 * pre-check + charge, and routing SFW-only here. This module only does the gen.
 */
export async function generateFalImage(
  req: FalImageRequest,
): Promise<FalImageResult> {
  const key = process.env.FAL_KEY;
  if (!key) {
    return { ok: false, reason: "config_error", message: "FAL_KEY not set" };
  }
  const headers = {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
  const hasRef = !!req.referenceImageUrls && req.referenceImageUrls.length > 0;
  const model = hasRef ? EDIT_MODEL : TEXT_TO_IMAGE_MODEL;
  const input: Record<string, unknown> = {
    prompt: req.prompt,
    image_size: { width: req.width, height: req.height },
    quality: req.quality ?? "high",
    num_images: 1,
    output_format: req.outputFormat ?? "png",
  };
  if (hasRef) input.image_urls = req.referenceImageUrls!.slice(0, 4);

  const provider = `fal:${model}`;
  const deadline = Date.now() + (req.timeoutMs ?? 280_000);

  // ─── Submit ────────────────────────────────────────────────────────────
  let submit: { request_id?: string; status_url?: string; response_url?: string };
  try {
    const r = await fetch(`${FAL_QUEUE_BASE}/${model}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(30_000),
    });
    const txt = await r.text();
    if (!r.ok) {
      const blob = txt.toLowerCase();
      if (blob.includes("exhausted balance") || blob.includes("locked")) {
        return { ok: false, reason: "balance_exhausted", message: txt.slice(0, 300) };
      }
      if (
        blob.includes("content") &&
        (blob.includes("policy") || blob.includes("safety") || blob.includes("moderation"))
      ) {
        return { ok: false, reason: "content_filter", message: txt.slice(0, 300) };
      }
      if (r.status === 429) {
        return { ok: false, reason: "rate_limited", message: txt.slice(0, 300) };
      }
      return {
        ok: false,
        reason: "provider_unavailable",
        message: `submit ${r.status}: ${txt.slice(0, 240)}`,
      };
    }
    submit = JSON.parse(txt);
  } catch (e) {
    return {
      ok: false,
      reason: "provider_unavailable",
      message: `submit failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const requestId = submit.request_id ?? "";
  const statusUrl =
    submit.status_url ?? `${FAL_QUEUE_BASE}/${model}/requests/${requestId}/status`;
  const responseUrl =
    submit.response_url ?? `${FAL_QUEUE_BASE}/${model}/requests/${requestId}`;

  // ─── Poll until COMPLETED ────────────────────────────────────────────────
  while (Date.now() < deadline) {
    await sleep(3_000);
    let status: { status?: string } | null = null;
    try {
      const sr = await fetch(statusUrl, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
      status = (await sr.json()) as { status?: string };
    } catch {
      continue; // transient poll error — keep trying until deadline
    }
    if (status?.status === "COMPLETED") break;
    if (status?.status === "FAILED" || status?.status === "ERROR") {
      return {
        ok: false,
        reason: "provider_unavailable",
        message: `fal job ${status.status}`,
      };
    }
  }
  if (Date.now() >= deadline) {
    return { ok: false, reason: "timeout", message: "fal job did not complete in time" };
  }

  // ─── Fetch result + download image ───────────────────────────────────────
  try {
    const rr = await fetch(responseUrl, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    const out = (await rr.json()) as {
      images?: Array<{ url?: string; width?: number; height?: number }>;
    };
    const img = out.images?.[0];
    if (!img?.url) {
      return { ok: false, reason: "unknown", message: "fal completed but no image url" };
    }
    const ir = await fetch(img.url, { signal: AbortSignal.timeout(60_000) });
    if (!ir.ok) {
      return { ok: false, reason: "unknown", message: `image download ${ir.status}` };
    }
    const buf = Buffer.from(await ir.arrayBuffer());
    return {
      ok: true,
      imageBase64: buf.toString("base64"),
      imageUrl: img.url,
      provider,
      requestId,
      width: img.width,
      height: img.height,
    };
  } catch (e) {
    return {
      ok: false,
      reason: "unknown",
      message: `result fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
