"use client";

/**
 * Default narrative language (settings overhaul 2026-06-01).
 *
 * Distinct from UI language: this pre-fills the language a NEW story is
 * written in at creation. "auto" = no default, decide each time.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setDefaultStoryLanguage } from "@/app/[locale]/settings/actions";

type Lang = "auto" | "zh-Hant" | "zh-Hans" | "en";

export function StoryLanguageSelect({ initial }: { initial: Lang }) {
  const t = useTranslations("settings.preferences");
  const [value, setValue] = useState<Lang>(initial);
  const [, startTransition] = useTransition();

  function pick(next: Lang) {
    setValue(next);
    startTransition(() => {
      void setDefaultStoryLanguage(next === "auto" ? null : next);
    });
  }

  return (
    <select
      value={value}
      onChange={(e) => pick(e.target.value as Lang)}
      className="h-8 rounded-md border px-2.5 text-sm se-cjk"
      style={{
        background: "var(--se-surface)",
        borderColor: "var(--se-border-strong)",
        color: "var(--se-fg)",
      }}
    >
      <option value="auto">{t("storyLangAuto")}</option>
      <option value="zh-Hant">{t("storyLangZhHant")}</option>
      <option value="zh-Hans">{t("storyLangZhHans")}</option>
      <option value="en">{t("storyLangEn")}</option>
    </select>
  );
}
