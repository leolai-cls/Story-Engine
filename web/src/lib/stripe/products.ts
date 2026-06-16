/**
 * Tier ↔ Stripe Price ID mapping · single source of truth.
 *
 * The product surfaces 3 tiers per locked Pricing v3 (founder · 2026-05-26):
 *   - Free                       no Stripe charge · 1,000 signup + 100/day
 *   - Standard  $9.99/mo         8,000 monthly credits (~150 turns)
 *   - Pro       $19.99/mo        18,000 monthly credits (~235 turns) · adult mode
 *
 * 2026-05-29 founder re-balance: Standard 2,000→8,000 · Pro 4,000→18,000 ·
 * free daily 50→100. Old gap (free ~1.5k/mo vs paid 2k) was too weak to
 * justify upgrading. Margin stays ~51-54% after the bump (see credits.ts).
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
      { en: "100 credits daily refresh", zh: "每日補返 100 credits" },
      { en: "Standard AI tier · CJK-tuned", zh: "Standard 模型 · 中文優化" },
      { en: "Memory + NPC + optional dice (deep mode)", zh: "記憶 + NPC + 可選擲骰（深模式）" },
    ],
  },
  adventurer: {
    publicName: "Standard",
    publicNameZh: "Standard",
    priceUsd: 9.99,
    monthlyCredits: 8000,
    bullets: [
      // ADR-022: 2-tier model · Standard 用戶可以用 Standard + Pro 兩個 model pool ·
      // 都可以開成人模式 (self-attest 18+). 2026-05-29: 2,000→8,000 credits.
      { en: "8,000 credits / month (~150 turns)", zh: "每月 8,000 credits (~150 回合)" },
      { en: "No turn cap · play as long as you want", zh: "無回合上限 · 玩到夠" },
      { en: "Standard + Pro AI models (Claude Sonnet 4.6 · Claude Opus 4.8)", zh: "Standard + Pro AI 模型（Claude Sonnet 4.6 · Claude Opus 4.8）" },
      { en: "Adult mode (self-attest 18+)", zh: "成人模式（自行確認 18+）" },
      { en: "Memory system + optional deep dice mode", zh: "記憶系統 + 可選擲骰深模式" },
    ],
  },
  storyteller: {
    publicName: "Pro",
    publicNameZh: "Pro",
    priceUsd: 19.99,
    monthlyCredits: 18000,
    bullets: [
      { en: "18,000 credits / month (~235 turns)", zh: "每月 18,000 credits (~235 回合)" },
      { en: "Same AI models as Standard · 2.25× the credits", zh: "同 Standard 一樣 AI 模型 · credits 多 2.25 倍" },
      { en: "Unlimited NPC Inner Voices", zh: "NPC 內心戲無限" },
      { en: "Adult mode (self-attest 18+)", zh: "成人模式（自行確認 18+）" },
    ],
  },
};

/**
 * Public plans-page rows (single source of truth for the /plans grid).
 *
 * Maps each DB-legacy tier id (free / adventurer / storyteller) to the
 * display nameKey used for i18n lookups (`plans.tiers.${nameKey}.*`) plus
 * the static price string and presentation flags. Previously this array was
 * inlined in app/[locale]/plans/page.tsx — colocated here next to the other
 * tier display constants so the tier↔name mapping lives in one place.
 */
export type PlanTierRow = {
  /** DB-legacy tier id (also used to compare against profiles.subscription_tier). */
  tier: PublicTier;
  /** i18n nameKey → plans.tiers.${nameKey}.{name,credits,features}. */
  nameKey: "free" | "standard" | "pro";
  /** Static display price (e.g. "$9.99"). */
  price: string;
  /** Paid tier id for the SubscribeButton, or null for Free. */
  paid: PaidTier | null;
  /** Subtle "recommended" treatment (middle tier). */
  recommended?: boolean;
  /** Strong "highlight" treatment (top tier). */
  highlight?: boolean;
};

export const PLAN_TIERS: readonly PlanTierRow[] = [
  {
    tier: "free",
    nameKey: "free",
    price: "$0",
    paid: null,
  },
  {
    tier: "adventurer", // DB legacy name · 顯示 Standard
    nameKey: "standard",
    price: "$9.99",
    paid: "adventurer",
    recommended: true, // Batch 4: middle tier was invisible · subtle 推薦 treatment
  },
  {
    tier: "storyteller", // DB legacy name · 顯示 Pro
    nameKey: "pro",
    price: "$19.99",
    paid: "storyteller",
    highlight: true,
  },
];

/**
 * Monthly credit grant per tier · used by webhook handlers when subscription
 * renews. Matches TIER_DISPLAY but extracted for type-safe lookups in code.
 */
export const TIER_MONTHLY_CREDITS: Record<PaidTier, number> = {
  adventurer: 8000,
  storyteller: 18000,
};

// ─── One-time top-up packs ──────────────────────────────────────────
// Configured in Stripe with metadata[credits] on both Product + Price
// (canonical source). Webhook reads metadata.credits at grant time so
// even if env mapping drifts, the credits-per-purchase stays correct.
//
// Env mapping is just the user-selectable bucket → Stripe Price ID.

export type TopUpPack = "small" | "medium" | "large";

const TOPUP_TO_ENV_KEY: Record<TopUpPack, string> = {
  small: "STRIPE_PRICE_TOPUP_SMALL",
  medium: "STRIPE_PRICE_TOPUP_MEDIUM",
  large: "STRIPE_PRICE_TOPUP_LARGE",
};

export function priceIdForTopUp(pack: TopUpPack): string {
  const envKey = TOPUP_TO_ENV_KEY[pack];
  const id = process.env[envKey];
  if (!id) {
    throw new Error(
      `Stripe Top-up Price ID missing · set ${envKey} in Vercel env vars (pack=${pack})`,
    );
  }
  return id;
}

export function topUpPackFromPriceId(priceId: string): TopUpPack | null {
  if (priceId === process.env.STRIPE_PRICE_TOPUP_SMALL) return "small";
  if (priceId === process.env.STRIPE_PRICE_TOPUP_MEDIUM) return "medium";
  if (priceId === process.env.STRIPE_PRICE_TOPUP_LARGE) return "large";
  return null;
}

/**
 * Display info for top-up packs. Keep in sync with Stripe Product metadata.
 * Webhook still reads from Stripe metadata as source of truth — these values
 * are for SSR rendering only.
 */
export const TOPUP_DISPLAY: Record<
  TopUpPack,
  { name: string; nameZh: string; priceUsd: number; credits: number; bonusPct: number }
> = {
  small: { name: "Starter", nameZh: "起步包", priceUsd: 5, credits: 1000, bonusPct: 0 },
  medium: { name: "Standard", nameZh: "標準包", priceUsd: 15, credits: 3500, bonusPct: 17 },
  large: { name: "Bulk", nameZh: "大量包", priceUsd: 30, credits: 8000, bonusPct: 33 },
};
