"use client";

/**
 * Export-my-data button (settings overhaul 2026-06-01).
 *
 * Calls the exportMyData action and downloads the returned JSON client-side.
 * Replaces the old disabled "v1.5+" placeholder.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { exportMyData } from "@/app/[locale]/settings/actions";

export function ExportDataButton() {
  const t = useTranslations("settings.account");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    startTransition(async () => {
      const res = await exportMyData();
      if (!res.ok) {
        setErr(t("exportFailed"));
        return;
      }
      try {
        const blob = new Blob([res.json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `kieio-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        setErr(t("exportFailed"));
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" disabled={pending} onClick={run}>
        <Download className="h-4 w-4" />
        {pending ? t("exportBusy") : t("exportButton")}
      </Button>
      {err && <span className="text-[11px]" style={{ color: "var(--se-danger)" }}>{err}</span>}
    </div>
  );
}
