"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, Loader2 } from "lucide-react";
import { deletePlaythrough } from "./actions";

/**
 * Per-row delete control for /my playthrough list.
 *
 * 2026-06-03 (founder ask). Destructive + irreversible → two-step inline
 * confirm (tap trash → 確認刪除? · 刪除 / 取消). Mobile-first: always-visible,
 * 32px touch target, no hover dependency, no blocking modal.
 *
 * Rendered as a sibling of the row <Link> (NOT nested) so taps never trigger
 * navigation. On success → router.refresh() re-runs the force-dynamic /my page.
 */
export function DeletePlaythroughButton({
  playthroughId,
  title,
}: {
  playthroughId: string;
  title: string;
}) {
  const t = useTranslations("my.delete");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onConfirm(e: React.MouseEvent) {
    stop(e);
    setFailed(false);
    startTransition(async () => {
      const res = await deletePlaythrough(playthroughId);
      if (res.ok) {
        router.refresh();
      } else {
        setFailed(true);
        setConfirming(false);
      }
    });
  }

  if (confirming) {
    return (
      <div
        className="inline-flex items-center gap-1.5"
        style={{ background: "var(--se-surface)" }}
      >
        <span
          className="se-cjk text-[11px] whitespace-nowrap"
          style={{ color: "var(--se-fg-muted)" }}
        >
          {t("confirm")}
        </span>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold se-cjk"
          style={{
            background: "var(--se-rose, #b91c1c)",
            color: "#fff",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          {t("yes")}
        </button>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            setConfirming(false);
          }}
          disabled={pending}
          className="inline-flex items-center rounded-md px-2 py-1 text-[11px] se-cjk"
          style={{
            background: "var(--se-surface-2)",
            color: "var(--se-fg-muted)",
            border: "1px solid var(--se-border)",
          }}
        >
          {t("cancel")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        setConfirming(true);
      }}
      aria-label={t("aria", { title })}
      title={failed ? t("failed") : t("button")}
      className="inline-flex items-center justify-center rounded-md transition-colors"
      style={{
        width: 32,
        height: 32,
        color: failed ? "var(--se-rose, #b91c1c)" : "var(--se-fg-dim)",
        background: "transparent",
      }}
    >
      <Trash2 size={15} />
    </button>
  );
}
