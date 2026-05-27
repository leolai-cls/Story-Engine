import { setRequestLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Check } from "lucide-react";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { createClient } from "@/lib/supabase/server";
import { TIER_DISPLAY, type PublicTier, type PaidTier } from "@/lib/stripe/products";
import { SubscribeButton } from "./subscribe-button";

/**
 * Pricing page · 3-tier (Pricing v3 locked 2026-05-26).
 *
 *   Free            $0          1k signup + 50/day refresh
 *   Standard        $9.99/mo    2k credits/mo · 80 NPC-L3 cap
 *   Pro             $19.99/mo   4k credits/mo · unlimited L3 · adult mode (after KYC)
 *
 * Internal tiers (free/adventurer/storyteller/legend) map to public tiers
 * (free/Standard/Pro) via TIER_DISPLAY · legend is hidden.
 *
 * Tier card behavior by auth state:
 *   - Anon                          → "Sign up to start" → /login?next=/pricing
 *   - Logged in · not subscribed    → "Subscribe" → Stripe Checkout
 *   - Logged in · on this tier      → "Current plan" + Manage link to billing portal
 *   - Logged in · on different paid tier → "Switch plan" → billing portal
 */

const PUBLIC_TIERS: PublicTier[] = ["free", "adventurer", "storyteller"];

const COPY = {
  zh: {
    title: "揀適合你嘅方案",
    subtitle: "全部方案包完整 AI 故事引擎 · NPC 真有人格 · 永久記憶 · 自適應介面",
    usdNotice: "價錢以美金計算 (USD)。Stripe 結帳支援港幣 / 台幣 / 信用卡 / Apple Pay / Google Pay。",
    perMonth: "/月",
    popular: "最熱門",
    ctaLogin: "登入後訂閱",
    ctaSubscribe: "立即訂閱",
    ctaCurrent: "你而家用緊呢個方案",
    ctaSwitch: "切換到呢個方案",
    ctaManage: "管理訂閱 / 取消",
    freeNoChange: "註冊就可以用",
  },
  en: {
    title: "Choose your plan",
    subtitle: "All tiers include the full AI story engine · NPCs with red lines · persistent memory · adaptive UI",
    usdNotice: "Prices in USD. Stripe Checkout accepts HKD/TWD cards, Apple Pay, Google Pay.",
    perMonth: "/mo",
    popular: "Most popular",
    ctaLogin: "Sign in to subscribe",
    ctaSubscribe: "Subscribe",
    ctaCurrent: "Your current plan",
    ctaSwitch: "Switch to this plan",
    ctaManage: "Manage / cancel",
    freeNoChange: "Free with signup",
  },
};

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCachedUser();

  // Determine current subscription state for CTA logic.
  let currentTier: string | null = null;
  let hasStripeCustomer = false;
  if (user) {
    const supabase = await createClient();
    const [{ data: profile }, { data: sub }] = await Promise.all([
      supabase
        .from("profiles")
        .select("subscription_tier")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("stripe_customer_id, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    currentTier = profile?.subscription_tier ?? "free";
    hasStripeCustomer = !!sub?.stripe_customer_id;
  }

  const lang: keyof typeof COPY = locale.startsWith("en") ? "en" : "zh";
  const c = COPY[lang];

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="container mx-auto max-w-5xl px-4 sm:px-6 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
              {c.title}
            </h1>
            <p className="text-muted-foreground">{c.subtitle}</p>
            <p className="mt-2 text-xs text-muted-foreground">{c.usdNotice}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {PUBLIC_TIERS.map((tier) => (
              <TierCard
                key={tier}
                tier={tier}
                isAuthed={!!user}
                currentTier={currentTier}
                hasStripeCustomer={hasStripeCustomer}
                lang={lang}
              />
            ))}
          </div>

          {!user && (
            <p className="text-center text-xs text-muted-foreground mt-8">
              {lang === "zh"
                ? "未有帳號？登入後可以揀方案。Guest mode 試玩免註冊。"
                : "No account yet? Sign in to subscribe. Guest mode is free to try."}
            </p>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function TierCard({
  tier,
  isAuthed,
  currentTier,
  hasStripeCustomer,
  lang,
}: {
  tier: PublicTier;
  isAuthed: boolean;
  currentTier: string | null;
  hasStripeCustomer: boolean;
  lang: "zh" | "en";
}) {
  const display = TIER_DISPLAY[tier];
  const c = COPY[lang];
  const isPopular = tier === "storyteller";
  const isFree = tier === "free";
  const name = lang === "zh" ? display.publicNameZh : display.publicName;

  return (
    <Card
      className={`relative flex flex-col ${
        isPopular ? "border-primary shadow-lg" : "border-border/60"
      }`}
    >
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
          {c.popular}
        </Badge>
      )}
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">{name}</CardTitle>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold tracking-tight">
            {isFree ? "$0" : `$${display.priceUsd.toFixed(2)}`}
          </span>
          {!isFree && <span className="text-sm text-muted-foreground">{c.perMonth}</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {isFree
            ? lang === "zh"
              ? "註冊送 1,000 · 每日補 50"
              : "1,000 on signup · 50 daily"
            : lang === "zh"
              ? `每月 ${display.monthlyCredits.toLocaleString()} credits`
              : `${display.monthlyCredits.toLocaleString()} credits / month`}
        </p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <ul className="space-y-2.5 text-sm flex-1 mb-6">
          {display.bullets.map((b) => (
            <li key={b.en} className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span className="text-muted-foreground">
                {lang === "zh" ? b.zh : b.en}
              </span>
            </li>
          ))}
        </ul>

        {isFree ? (
          <div className="w-full px-4 py-2 text-center text-sm text-muted-foreground border border-dashed border-border/60 rounded-md">
            {c.freeNoChange}
          </div>
        ) : (
          <SubscribeButton
            tier={tier as PaidTier}
            isAuthed={isAuthed}
            currentTier={currentTier}
            hasStripeCustomer={hasStripeCustomer}
            labelSubscribe={c.ctaSubscribe}
            labelCurrent={c.ctaCurrent}
            labelManage={c.ctaManage}
            labelSwitch={c.ctaSwitch}
            labelLogin={c.ctaLogin}
          />
        )}
      </CardContent>
    </Card>
  );
}
