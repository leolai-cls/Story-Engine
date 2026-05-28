"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { signOut } from "@/app/[locale]/login/actions";

export function SignOutButton() {
  // Wave 2 i18n migration (2026-05-27): localize "登出" (was hardcoded 繁中).
  const t = useTranslations("nav");
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut className="h-4 w-4" />
        {t("logout")}
      </Button>
    </form>
  );
}
