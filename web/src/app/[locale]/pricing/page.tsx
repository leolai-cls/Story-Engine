import { setRequestLocale } from "next-intl/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { createClient } from "@/lib/supabase/server";
import { MarketingPricing } from "@/components/marketing/MarketingPricing";
import { langFromLocale } from "@/components/marketing/copy";

/**
 * Pricing page · marketing route · dark cinematic theme matching kieio.com.
 *
 * Subdomain split (per middleware.ts):
 *   kieio.com/pricing       → renders this page (marketing host)
 *   app.kieio.com/pricing   → 308 redirect → kieio.com/pricing
 *
 * Pricing v3 locked (2026-05-26):
 *   Free            $0          1k signup + 50/day refresh
 *   Standard        $9.99/mo    2k credits/mo
 *   Pro             $19.99/mo   4k credits/mo · unlimited NPC L3 · adult mode
 *
 * Server reads user + subscription state · passes to <MarketingPricing /> client
 * component which owns the cinematic dark layout and Subscribe / Manage CTAs.
 */

export default async function PricingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ canceled?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;

  const user = await getCachedUser();

  // Determine current subscription state for CTA logic.
  let currentTier: string | null = null;
  let hasStripeCustomer = false;
  let pendingCancel = false;
  if (user) {
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
    currentTier = profile?.subscription_tier ?? "free";
    // Per Wave 3 audit fix · either source counts (top-up-only users have
    // customer_id on profile only).
    hasStripeCustomer = !!(sub?.stripe_customer_id || profile?.stripe_customer_id);
    pendingCancel = !!sub?.cancel_at_period_end && sub.status === "active";
  }

  return (
    <MarketingPricing
      lang={langFromLocale(locale)}
      isAuthed={!!user}
      currentTier={currentTier}
      hasStripeCustomer={hasStripeCustomer}
      pendingCancel={pendingCancel}
      showCanceledToast={sp.canceled === "1"}
      locale={locale}
    />
  );
}
