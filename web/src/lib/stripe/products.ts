/**
 * Tier ↔ Stripe Price ID mapping · single source of truth.
 *
 * The product surfaces 3 tiers per locked Pricing v3 (founder · 2026-05-26):
 *   - Free                       no Stripe charge · daily 50 refresh
 *   - Standard  $9.99/mo         2,000 monthly credits · 80 NPC-L3 cap
 *   - Pro       $19.99/mo        4,000 monthly credits · full L3 · adult mode
 *
 * Internal DB uses legacy 4-tier names (free / adventurer / storyteller /
 * legend) — too many call sites to refactor today. We map:
 *
 *   Standard  ↔  adventurer
 *   Pro       ↔  storyteller
 *   (legend tier is deprecated · hidden from UI · still tolerated in DB)
 *
 * Stripe Price IDs live in env vars so test-mode and prod-mode share code.
 * Vercel env:
 *   STRIPE_PRICE_STANDARD_MONTHLY=price_xxx  (the $9.99 recurring price)
 *   STRIPE_PRICE_PRO_MONTHLY=price_xxx       (the $19.99 recurring price)
 *
 * Future: add top-up Price IDs (one-time credit packs) when that ships.
 */

/** Paid tiers that have a Stripe Price ID. */
export type PaidTier = "adventurer" | "storyteller";

/** Public-facing tier surfaced in the pricing page. */
export type PublicTier = "free" | PaidTier;

const TIER_TO_ENV_KEY: Record<PaidTier, string> = {
  adventurer: "STRIPE_PRICE_STANDARD_MONTHLY",
  storyteller: "STRIPE_PRICE_PRO_MONTHLY",
};

export function priceIdForTier(tier: PaidTier): string {
  const envKey = TIER_TO_ENV_KEY[tier];
  const id = process.env[envKey];
  if (!id) {
    throw new Error(
      `Stripe Price ID missing · set ${envKey} in Vercel env vars (tier=${tier})`,
    );
  }
  return id;
}

/**
 * Reverse lookup — used in webhook handlers to figure out which tier the
 * subscription is for. Returns null if the Price ID doesn't match any
 * configured tier (defensive · helps catch misconfigured envs early).
 */
export function tierFromPriceId(priceId: string): PaidTier | null {
  if (priceId === process.env.STRIPE_PRICE_STANDARD_MONTHLY) {
    return "adventurer";
  }
  if (priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) {
    return "storyteller";
  }
  return null;
}

/**
 * Pricing UI display data. Keep in sync with what the founder publishes
 * in Stripe Products dashboard — these are duplicates of the Stripe values
 * for fast SSR rendering (avoid Stripe API call on every pricing page hit).
 */
export const TIER_DISPLAY: Record<
  PublicTier,
  {
    publicName: string;
    publicNameZh: string;
    priceUsd: number;
    monthlyCredits: number;
    bullets: { en: string; zh: string }[];
  }
> = {
  free: {
    publicName: "Free",
    publicNameZh: "免費",
    priceUsd: 0,
    monthlyCredits: 0,
    bullets: [
      { en: "1,000 credits on signup", zh: "註冊送 1,000 credits" },
      { en: "50 credits daily refresh", zh: "每日補返 50 credits" },
      { en: "Standard AI tier · CJK-tuned", zh: "Standard 模型 · 中文優化" },
      { en: "Memory + NPC + Skill Check", zh: "記憶 + NPC + 擲骰系統" },
    ],
  },
  adventurer: {
    publicName: "Standard",
    publicNameZh: "Standard",
    priceUsd: 9.99,
    monthlyCredits: 2000,
    bullets: [
      { en: "2,000 credits / month", zh: "每月 2,000 credits" },
      { en: "No turn cap · play as long as you want", zh: "無回合上限 · 玩到夠" },
      { en: "Pro + Pro Max AI tiers unlocked", zh: "解鎖 Pro + Pro Max 模型" },
      { en: "Up to 80 NPC Inner Voice turns / month", zh: "每月 80 turn NPC 內心戲" },
    ],
  },
  storyteller: {
    publicName: "Pro",
    publicNameZh: "Pro",
    priceUsd: 19.99,
    monthlyCredits: 4000,
    bullets: [
      { en: "4,000 credits / month", zh: "每月 4,000 credits" },
      { en: "Unlimited NPC Inner Voices", zh: "NPC 內心戲無限" },
      { en: "Full Pro + Pro Max AI access", zh: "Pro + Pro Max 模型無限" },
      { en: "Adult mode (after age verification)", zh: "成人模式 (KYC 後解鎖)" },
    ],
  },
};

/**
 * Monthly credit grant per tier · used by webhook handlers when subscription
 * renews. Matches TIER_DISPLAY but extracted for type-safe lookups in code.
 */
export const TIER_MONTHLY_CREDITS: Record<PaidTier, number> = {
  adventurer: 2000,
  storyteller: 4000,
};
