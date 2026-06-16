import { setRequestLocale, getLocale, getTranslations } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { SubscribeButton } from "@/app/[locale]/pricing/subscribe-button";
import { ArrowLeft, Check } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * In-app 方案頁 (/plans) — 2026-06-01 settings overhaul.
 *
 * Settings 嘅 upgrade / viewPlans CTA link 去呢度 (唔再去 marketing /pricing ·
 * founder 之前 confused 點解 in-app 升級會跳出 marketing dark 頁)。
 *
 * 用 product 嘅 warm-paper 主題 (SiteHeader/Footer · 同 settings 一致) · 唔係
 * marketing dark cinematic。重用 pricing 嘅 SubscribeButton (自己處理 checkout /
 * billing portal / switch flow)。2 tier (Standard / Pro) + Free。
 */

const PLAN_TIERS = [
  {
    tier: "free" as const,
    nameKey: "free",
    price: "$0",
    paid: null,
  },
  {
    tier: "adventurer" as const, // DB legacy name · 顯示 Standard
    nameKey: "standard",
    price: "$9.99",
    paid: "adventurer" as const,
    recommended: true, // Batch 4: middle tier was invisible · subtle 推薦 treatment
  },
  {
    tier: "storyteller" as const, // DB legacy name · 顯示 Pro
    nameKey: "pro",
    price: "$19.99",
    paid: "storyteller" as const,
    highlight: true,
  },
];

export default async function PlansPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("plans");

  const user = await getCachedUser();
  if (!user) {
    const l = await getLocale();
    redirect({ href: "/login", locale: l });
    throw new Error("unreachable");
  }

  const supabase = await createClient();
  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase
      .from("profiles")
      .select("subscription_tier, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("stripe_customer_id, status, cancel_at_period_end")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const currentTier = profile?.subscription_tier ?? "free";
  const hasStripeCustomer = !!(sub?.stripe_customer_id || profile?.stripe_customer_id);
  const pendingCancel = !!sub?.cancel_at_period_end && sub.status === "active";

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-8">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold mb-1">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mb-8">{t("subtitle")}</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLAN_TIERS.map((p) => {
            const isCurrent = currentTier === p.tier;
            const features = t.raw(`tiers.${p.nameKey}.features`) as string[];
            return (
              <div
                key={p.nameKey}
                className={`rounded-xl border p-5 flex flex-col ${
                  p.highlight
                    ? "border-primary/50 bg-primary/5"
                    : p.recommended
                      ? "border-primary/30 bg-primary/[0.03]"
                      : "border-border/60 bg-card/40"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold">{t(`tiers.${p.nameKey}.name`)}</h2>
                  {p.highlight ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-primary/15 text-primary px-2 py-0.5">
                      {t("popular")}
                    </span>
                  ) : p.recommended ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-primary/10 text-primary px-2 py-0.5">
                      {t("recommended")}
                    </span>
                  ) : null}
                </div>
                <div className="mb-1">
                  <span className="text-2xl font-bold">{p.price}</span>
                  {p.paid && <span className="text-sm text-muted-foreground">{t("perMonth")}</span>}
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  {t(`tiers.${p.nameKey}.credits`)}
                </p>

                <ul className="flex-1 space-y-2 mb-5">
                  {features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 flex-none text-primary mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {p.paid ? (
                  <SubscribeButton
                    tier={p.paid}
                    isAuthed={true}
                    currentTier={currentTier}
                    hasStripeCustomer={hasStripeCustomer}
                    pendingCancel={pendingCancel}
                    labelSubscribe={t("ctaSubscribe")}
                    labelCurrent={t("ctaCurrent")}
                    labelPendingCancel={t("ctaResume")}
                    labelManage={t("ctaManage")}
                    labelSwitch={t("ctaSwitch")}
                    labelLogin={t("ctaLogin")}
                  />
                ) : (
                  <div className="text-center text-xs text-muted-foreground py-2">
                    {isCurrent ? t("ctaCurrent") : t("freeDefault")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
