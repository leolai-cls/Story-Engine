"use client";

import { useEffect, useId, useState, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Sparkles,
  X,
  ImageIcon,
  BookOpen,
  Smartphone,
  Upload,
  Wand2,
  Palette,
  Loader2,
  Lock,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import {
  uploadStyleReference,
} from "@/app/[locale]/play/[playthroughId]/visualize-actions";
import {
  KIEIO_STYLES,
  STYLE_KEYS,
  matchStylesForSeed,
  type StyleKey,
} from "@/lib/ai/image-styles";
import { estimateImageCredits, type ImageType } from "@/lib/ai/image-gen";
import { Link } from "@/i18n/navigation";

/**
 * Phase 8 · Visualize Scene Modal.
 *
 * 3-tier style picker:
 *   - Preset: 10 region-based styles (港式漫畫風 etc) — default tab
 *   - Upload: user uploads reference image (24h-bound), AI imitates
 *   - Custom: user writes own style prompt (Pro tip · civitai paste)
 *
 * Image types: illustration (default 16:9) · comic (4:3 GPT Image) · wallpaper (9:19.5)
 *
 * NSFW: routed automatically based on story.content_rating (passed in).
 * Adult-rated stories require adult_mode_enabled + KYC verified.
 *
 * Hard rule #6 floor: filename moderation done in uploadStyleReference action.
 * Image content moderation = provider safety filter (OpenRouter).
 *
 * TOS-shift posture per founder: user warrants ownership of uploaded references.
 */

type Stage = "form" | "loading" | "success" | "error";

/** What the modal hands to the parent on submit. The parent (play-client) adds
 *  playthroughId + turnIndex and runs generation in the BACKGROUND so the modal
 *  can close immediately (non-blocking · founder 2026-05-30). */
export type VisualizeRequest = {
  imageType: ImageType;
  styleMode: "preset" | "upload" | "custom";
  styleKey?: StyleKey;
  styleReferenceId?: string;
  customPrompt?: string;
  proQuality?: boolean;
  /** Precomputed for the optimistic placeholder's hover label. */
  styleValue: string;
};

export type VisualizeSceneModalProps = {
  open: boolean;
  onClose: () => void;
  playthroughId: string;
  turnIndex: number;
  storyContentRating: "sfw" | "soft" | "adult";
  storyDescription: string;
  /** Story-default style if set at creation. Used to pre-select preset. */
  storyDefaultStyleKey?: StyleKey | null;
  /** Current user tier · gates free users out + drives Pro-only features. */
  subscriptionTier: "free" | "adventurer" | "storyteller" | "legend";
  /** Current credit balance for CTA pricing display. */
  currentBalance: number;
  /**
   * Fired when the user submits. The parent runs generation in the BACKGROUND
   * (modal closes immediately · ChatGPT-style) and shows an inline pending
   * placeholder on the turn that resolves to the image when ready.
   */
  onGenerate: (req: VisualizeRequest) => void;
};

export function VisualizeSceneModal({
  open,
  onClose,
  playthroughId,
  turnIndex,
  storyContentRating,
  storyDescription,
  storyDefaultStyleKey,
  subscriptionTier,
  currentBalance,
  onGenerate,
}: VisualizeSceneModalProps) {
  const locale = useLocale() as "en" | "zh-Hant" | "zh-Hans";
  const t = useTranslations("play.visualize");
  const tErr = useTranslations("play.visualize.errors");

  const [stage, setStage] = useState<Stage>("form");
  const [imageType, setImageType] = useState<ImageType>("illustration");
  const [styleMode, setStyleMode] = useState<"preset" | "upload" | "custom">("preset");

  // Preset tab state · null-safe even if parent forgets to coalesce
  const suggestedKeys =
    matchStylesForSeed(storyDescription ?? "").slice(0, 3) as StyleKey[];
  const defaultKey: StyleKey =
    storyDefaultStyleKey ?? suggestedKeys[0] ?? "cinematic";
  const [selectedStyleKey, setSelectedStyleKey] = useState<StyleKey>(defaultKey);

  // Upload tab state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedRef, setUploadedRef] = useState<{
    id: string;
    storageUrl: string;
  } | null>(null);
  const [uploadAck, setUploadAck] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Custom tab state
  const [customPrompt, setCustomPrompt] = useState("");

  // Pro-quality (comic only)
  const [proQuality, setProQuality] = useState(false);

  // Error (upload + form validation)
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  // Wave 3 fix UX-HIGH-07: Escape key + focus trap basics
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !uploading) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, uploading]);

  // ─── Reset state when modal closes ──────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setStage("form");
      setImageType("illustration");
      setStyleMode("preset");
      setSelectedStyleKey(defaultKey);
      setUploadedRef(null);
      setUploadAck(false);
      setUploading(false);
      setCustomPrompt("");
      setProQuality(false);
      setErrorCode(null);
    }
  }, [open, defaultKey]);

  // ─── Free tier guard ────────────────────────────────────────────────────
  const isFree = subscriptionTier === "free";

  // ─── Adult mode guard (story content_rating='adult') ───────────────────
  // Note: server enforces · client only hints. If gate denies, server returns
  // error: 'adult_mode_required' and we surface localized message.

  // ─── Cost calculation ──────────────────────────────────────────────────
  const cost = estimateImageCredits(
    storyContentRating,
    imageType,
    proQuality && imageType === "comic" && subscriptionTier === "storyteller",
  );
  const insufficient = cost > currentBalance;

  // ─── Submit handler ─────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (isFree) return;
    if (styleMode === "upload" && !uploadedRef) return;
    if (styleMode === "custom" && !customPrompt.trim()) return;

    if (insufficient) return;

    const styleValue =
      styleMode === "preset"
        ? selectedStyleKey
        : styleMode === "custom"
          ? customPrompt.trim().slice(0, 200)
          : styleMode === "upload" && uploadedRef
            ? uploadedRef.storageUrl
            : "";

    // Non-blocking (founder 2026-05-30): hand the request to the parent, which
    // runs generation in the BACKGROUND + shows an inline pending placeholder on
    // the turn. Close the modal immediately so the player can keep playing — no
    // blocking spinner, no forced page refresh (revalidatePath dropped server-side).
    onGenerate({
      imageType,
      styleMode,
      styleKey: styleMode === "preset" ? selectedStyleKey : undefined,
      styleReferenceId: styleMode === "upload" ? uploadedRef?.id : undefined,
      customPrompt: styleMode === "custom" ? customPrompt.trim() : undefined,
      proQuality:
        proQuality && imageType === "comic" && subscriptionTier === "storyteller",
      styleValue,
    });
    onClose();
  };

  // ─── Upload handler ─────────────────────────────────────────────────────
  const handleFilePick = async (file: File) => {
    setUploading(true);
    setErrorCode(null);
    const form = new FormData();
    form.append("file", file);
    const res = await uploadStyleReference(form);
    setUploading(false);
    if (res.ok) {
      setUploadedRef({ id: res.id, storageUrl: res.storageUrl });
    } else {
      setErrorCode(res.error);
    }
  };

  if (!open) return null;

  // Wave 3 fix UX-MED-02: don't close mid-upload or mid-generation
  const safeClose = () => {
    if (uploading) return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{
        background: "var(--se-overlay, rgba(0,0,0,0.55))",
        backdropFilter: "blur(8px)",
      }}
      onClick={safeClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: "var(--se-surface)",
          border: "1px solid var(--se-border-strong)",
          boxShadow: "var(--se-shadow-modal)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={safeClose}
          aria-label={t("close")}
          disabled={uploading}
          className="absolute right-2 top-2 inline-flex items-center justify-center rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* W4 fix · 2026-05-28: free user 都顯示完整 form · 揀完先喺 CTA 度 paywall
           (founder feedback: 唔好 button 一按即 wall, 應該見到 modal · 揀風格 · 然後升級).
           tier check 喺 CTA 邏輯 + handleSubmit 雙重把守. */}

        {/* ───────── FORM stage ───────── */}
        {stage === "form" && (
          <div className="p-4 sm:p-6 space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 id={titleId} className="text-base font-semibold se-cjk">
                  {t("modalTitle")}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground se-cjk">
                {t("modalSubtitle")}
              </p>
            </div>

            {/* ─── Image type picker ─── */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                {t("imageType.label")}
              </label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("imageType.label")}>
                {(
                  [
                    { key: "illustration", icon: ImageIcon },
                    { key: "comic", icon: BookOpen },
                    { key: "wallpaper", icon: Smartphone },
                  ] as const
                ).map(({ key, icon: Icon }) => {
                  const active = imageType === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={t(`imageType.${key}`)}
                      onClick={() => setImageType(key as ImageType)}
                      className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-all active:scale-95 ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-foreground/30"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-xs font-medium se-cjk">
                        {t(`imageType.${key}`)}
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-tight text-center se-cjk">
                        {t(`imageType.${key}Hint`)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {imageType === "comic" && subscriptionTier === "storyteller" && (
                <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={proQuality}
                    onChange={(e) => setProQuality(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="se-cjk">{t("proQualityLabel")}</span>
                </label>
              )}
            </div>

            {/* ─── Style mode tabs ─── */}
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                {t("styleMode.label")}
              </label>
              <div className="flex gap-1 border-b border-border mb-3" role="tablist" aria-label={t("styleMode.label")}>
                {(
                  [
                    { key: "preset", icon: Palette },
                    { key: "upload", icon: Upload },
                    { key: "custom", icon: Wand2 },
                  ] as const
                ).map(({ key, icon: Icon }) => {
                  const active = styleMode === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`style-panel-${key}`}
                      onClick={() => setStyleMode(key)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                        active
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="se-cjk">
                        {t(`styleMode.${key}`)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Preset tab */}
              {styleMode === "preset" && (
                <div className="space-y-2">
                  {suggestedKeys.length > 0 && (
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground se-cjk inline-flex items-center gap-1">
                      <Wand2 className="h-3 w-3" />
                      {t("styleSuggestion")}
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto">
                    {STYLE_KEYS.map((key) => {
                      const style = KIEIO_STYLES[key];
                      const active = selectedStyleKey === key;
                      const suggested = suggestedKeys.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedStyleKey(key)}
                          className={`text-left rounded-md border p-2 transition-all active:scale-95 ${
                            active
                              ? "border-primary bg-primary/5"
                              : suggested
                                ? "border-amber-500/40 hover:border-amber-500/70"
                                : "border-border hover:border-foreground/30"
                          }`}
                        >
                          <div className="text-sm font-medium se-cjk leading-tight">
                            {style.name[locale] ?? style.name.en}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 se-cjk">
                            {style.bestForGenres.slice(0, 3).join(" · ")}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upload tab */}
              {styleMode === "upload" && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground se-cjk">
                    {t("styleMode.uploadHint")}
                  </p>
                  {!uploadedRef ? (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFilePick(f);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border p-6 text-sm hover:border-foreground/40 disabled:opacity-50"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="se-cjk">…</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            <span className="se-cjk">{t("styleMode.uploadButton")}</span>
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 rounded-md border border-border p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={uploadedRef.storageUrl}
                        alt={t("styleMode.upload")}
                        className="h-16 w-16 rounded object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedRef(null);
                          setUploadAck(false);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                        aria-label={t("close")}
                        className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {uploadedRef && (
                    <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={uploadAck}
                        onChange={(e) => setUploadAck(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5"
                      />
                      <span className="se-cjk leading-snug">
                        {t("styleMode.uploadAck")}
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* Custom tab */}
              {styleMode === "custom" && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground se-cjk">
                    {t("styleMode.customHint")}
                  </p>
                  <textarea
                    value={customPrompt}
                    onChange={(e) =>
                      setCustomPrompt(e.target.value.slice(0, 500))
                    }
                    placeholder={t("styleMode.customPlaceholder")}
                    rows={4}
                    className="w-full rounded-md border border-border bg-background p-3 text-sm focus:border-primary focus:outline-none se-cjk"
                  />
                  <div className="text-[10px] text-right text-muted-foreground">
                    {customPrompt.length} / 500
                  </div>
                </div>
              )}
            </div>

            {/* ─── TOS short ─── */}
            <p className="text-[11px] text-muted-foreground se-cjk leading-snug">
              {t("tosShort")}{" "}
              <Link href="/terms" className="underline hover:text-foreground">
                {t("tosLink")}
              </Link>
              .
            </p>

            {/* ─── Error display (for upload error before submit) ─── */}
            {errorCode && stage === "form" && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-destructive flex-shrink-0" />
                <span className="se-cjk text-foreground">
                  {tErr(errorCode as never)}
                </span>
              </div>
            )}

            {/* ─── CTA ─── */}
            {(() => {
              // W4 fix: free user 撳到 modal 揀風格 · 但 CTA 變升級 link 而唔係生成.
              // 之前係 button 一按即 wall (form 都見唔到) · founder feedback 太突兀.
              if (isFree) {
                return (
                  <Link
                    href="/settings"
                    className="block w-full text-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    🔒 {t("tier.freeBlocked")} · {t("tier.freeBlockedCta")}
                  </Link>
                );
              }
              const needsAck = styleMode === "upload" && uploadedRef && !uploadAck;
              const needsFile = styleMode === "upload" && !uploadedRef;
              const needsCustom = styleMode === "custom" && !customPrompt.trim();
              const isDisabled =
                insufficient ||
                needsAck ||
                needsFile ||
                needsCustom;
              const label = insufficient
                ? t("ctaInsufficient", { needed: cost, balance: currentBalance })
                : needsFile
                  ? t("ctaNeedsFile")
                  : needsAck
                    ? t("ctaNeedsAck")
                    : needsCustom
                      ? t("ctaNeedsCustom")
                      : t("cta", { credits: cost });
              return (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isDisabled}
                  className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground transition-colors"
                >
                  {label}
                </button>
              );
            })()}
          </div>
        )}

      </div>
    </div>
  );
}
