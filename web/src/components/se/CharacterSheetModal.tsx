"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, X, Download, Loader2 } from "lucide-react";

/**
 * Wave 3 · Character design-sheet VIEWER modal.
 *
 * Deliberately simpler than VisualizeSceneModal: the sheet needs NO style /
 * type picker (the backend auto-uses the story's locked style + composes the
 * adaptive sheet prompt from the character × world). This modal only SHOWS the
 * result — a loading placeholder while the background gen runs (~1-2 min), then
 * the finished landscape sheet (1536×1024) + a download link.
 *
 * Mirrors VisualizeSceneModal styling tokens: var(--se-surface) /
 * var(--se-border-strong) / var(--se-shadow-modal) · fixed backdrop-blur
 * overlay · Escape-to-close · max-h-[90vh] scroll · safe-area padding · se-cjk.
 */

export type CharacterSheetModalProps = {
  open: boolean;
  onClose: () => void;
  characterName: string;
  /** Empty / unset while still generating (isLoading drives the placeholder). */
  storageUrl: string;
  isLoading: boolean;
};

export function CharacterSheetModal({
  open,
  onClose,
  characterName,
  storageUrl,
  isLoading,
}: CharacterSheetModalProps) {
  const t = useTranslations("play.characterSheet");
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  // Escape-to-close (matches VisualizeSceneModal UX-HIGH-07).
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{
        background: "var(--se-overlay, rgba(0,0,0,0.55))",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
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
          onClick={onClose}
          aria-label={t("close")}
          className="absolute right-2 top-2 inline-flex items-center justify-center rounded-md p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors z-10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-4 sm:p-6 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 id={titleId} className="text-base font-semibold se-cjk">
                {t("modalTitle", { name: characterName })}
              </h2>
            </div>
          </div>

          {isLoading || !storageUrl ? (
            <div
              className="flex flex-col items-center justify-center gap-2.5 rounded-lg border border-primary/30 bg-muted/40"
              style={{ aspectRatio: "3 / 2" }}
            >
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-xs se-cjk text-muted-foreground px-3 text-center leading-snug">
                {t("loading")}
              </span>
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={storageUrl}
                alt={t("modalTitle", { name: characterName })}
                className="w-full rounded-lg border border-border/60"
              />
              <a
                href={storageUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors se-cjk"
              >
                <Download className="h-4 w-4" />
                {t("download")}
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
