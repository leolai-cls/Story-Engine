"use client";

/**
 * Editable display name (settings overhaul 2026-06-01).
 *
 * Was a read-only row — the page even advertised "顯示名稱" as editable but
 * gave no affordance. Click → inline input → save. The name shows on public
 * comments / stories so users must be able to change an ugly OAuth default.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Pencil, X } from "lucide-react";
import { setDisplayName } from "@/app/[locale]/settings/actions";

export function DisplayNameEditor({ initial }: { initial: string }) {
  const t = useTranslations("settings.profile");
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    const next = draft.trim();
    if (next.length < 1 || next.length > 40) {
      setErr(t("displayNameInvalid"));
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await setDisplayName(next);
      if (res.ok) {
        setValue(next);
        setEditing(false);
      } else {
        setErr(t("displayNameSaveFailed"));
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setErr(null);
          setEditing(true);
        }}
        className="inline-flex items-center gap-1.5 text-sm se-cjk hover:opacity-70 transition-opacity"
        style={{ color: "var(--se-fg)" }}
      >
        <span>{value?.trim() || t("displayNamePlaceholder")}</span>
        <Pencil size={13} style={{ color: "var(--se-fg-muted)" }} />
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={draft}
          maxLength={40}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-8 w-40 rounded-md border px-2.5 text-sm se-cjk"
          style={{
            background: "var(--se-surface)",
            borderColor: "var(--se-border-strong)",
            color: "var(--se-fg)",
          }}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-label={t("displayNameSave")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: "var(--se-fg)", color: "var(--se-bg)" }}
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          aria-label={t("displayNameCancel")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: "var(--se-surface-2)", color: "var(--se-fg-2)" }}
        >
          <X size={14} />
        </button>
      </div>
      {err && <span className="text-[11px]" style={{ color: "var(--se-danger)" }}>{err}</span>}
    </div>
  );
}
