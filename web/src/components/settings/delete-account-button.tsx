"use client";

/**
 * Delete-account button + confirm dialog (settings overhaul 2026-06-01).
 *
 * Two-step: click → modal requiring the user to type a confirm word → calls
 * deleteMyAccount (which cancels Stripe then cascades the DB delete) → signs
 * out + redirects home. Replaces the old disabled placeholder.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { TriangleAlert, X } from "lucide-react";
import { deleteMyAccount } from "@/app/[locale]/settings/actions";
import { createClient } from "@/lib/supabase/client";

export function DeleteAccountButton() {
  const t = useTranslations("settings.account");
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const confirmWord = t("deleteConfirmWord");
  const canDelete = confirmText.trim() === confirmWord;

  function doDelete() {
    if (!canDelete) return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteMyAccount();
      if (!res.ok) {
        setErr(t("deleteFailed"));
        return;
      }
      // Sign out client-side then hard-redirect home (account row is gone).
      try {
        await createClient().auth.signOut();
      } catch {}
      window.location.href = "/";
    });
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => { setConfirmText(""); setErr(null); setOpen(true); }}>
        {t("deleteButton")}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          style={{ background: "var(--se-overlay)", backdropFilter: "blur(6px)" }}
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-[460px] max-h-[90dvh] overflow-y-auto rounded-2xl p-5 sm:p-6"
            style={{
              background: "var(--se-surface)",
              border: "1px solid var(--se-border-strong)",
              boxShadow: "var(--se-shadow-modal)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: "var(--se-danger-bg, rgba(225,29,72,.1))", color: "var(--se-danger)" }}>
                <TriangleAlert size={18} />
              </div>
              <button type="button" onClick={() => !pending && setOpen(false)} aria-label={t("deleteDialogClose")} style={{ color: "var(--se-fg-muted)" }}>
                <X size={16} />
              </button>
            </div>
            <h2 className="text-lg font-semibold m-0 mb-2 se-cjk" style={{ color: "var(--se-fg)" }}>
              {t("deleteDialogTitle")}
            </h2>
            <p className="m-0 text-sm se-cjk" style={{ color: "var(--se-fg-2)", lineHeight: 1.65 }}>
              {t("deleteDialogBody")}
            </p>
            <label className="block mt-4 text-xs se-cjk" style={{ color: "var(--se-fg-muted)" }}>
              {t.rich("deleteConfirmPrompt", { word: () => <b style={{ color: "var(--se-danger)" }}>{confirmWord}</b> })}
            </label>
            <input
              value={confirmText}
              disabled={pending}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmWord}
              className="mt-1.5 w-full h-9 rounded-md border px-3 text-sm se-cjk"
              style={{ background: "var(--se-surface-2)", borderColor: "var(--se-border-strong)", color: "var(--se-fg)" }}
            />
            {err && <p className="mt-2 text-xs" style={{ color: "var(--se-danger)" }}>{err}</p>}
            <div className="flex gap-2.5 mt-5">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                disabled={pending}
                className="flex-1 h-10 rounded-md text-sm font-medium se-cjk"
                style={{ background: "var(--se-surface-2)", color: "var(--se-fg-2)", border: "1px solid var(--se-border)" }}
              >
                {t("deleteDialogCancel")}
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={pending || !canDelete}
                className="flex-1 h-10 rounded-md text-sm font-semibold se-cjk transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "var(--se-danger)", color: "#fff" }}
              >
                {pending ? t("deleteDialogProcessing") : t("deleteDialogConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
