import { setRequestLocale, getLocale, getTranslations } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Coins,
  User as UserIcon,
  CreditCard,
  ShieldAlert,
  Settings as SettingsIcon,
  Info,
  Mail,
  FileText,
  Lock as LockIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { TIER_CONFIG, type Tier } from "@/lib/billing/credits";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { AdultModeToggle } from "@/components/settings/adult-mode-toggle";
import { BillingPortalButton } from "@/components/settings/billing-portal-button";
import { TopUpButtons } from "@/components/settings/topup-buttons";
import { BillingToast } from "@/components/settings/billing-toast";
import { DisplayNameEditor } from "@/components/settings/display-name-editor";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { StoryLanguageSelect } from "@/components/settings/story-language-select";
import { NotificationPrefs } from "@/components/settings/notification-prefs";
import { ExportDataButton } from "@/components/settings/export-data-button";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";
import { LocaleSwitcher } from "@/components/se/LocaleSwitcher";

export const dynamic = "force-dynamic";

const SUPPORT_EMAIL = "support@kieio.com";

/**
 * Settings page — UI tier v1 (Grok aesthetic · sticky sidebar nav · atomic SettingsCard/Row).
 *
 * Layout:
 *   - Sticky left nav (5 sections · anchor jumps with smooth scroll)
 *   - Main content with section anchors:
 *     #profile · #preferences · #adult · #credits · #account
 *
 * On mobile: nav collapses · sections stack vertically.
 */
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    subscribed?: string;
    topup?: string;
    topup_canceled?: string;
    verified?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Wave 2 i18n migration (2026-05-27): full page localized via settings.* catalog.
  const t = await getTranslations("settings");
  const sp = await searchParams;

  // AUDIT FIX MG-PERF-HIGH-01: cached — SiteHeader dedupes against this call.
  const user = await getCachedUser();
  if (!user) {
    const l = await getLocale();
    redirect({ href: "/login", locale: l });
    throw new Error("unreachable");
  }
  const supabase = await createClient();

  const [profileRes, ledgerRes, subRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        // Wave 3 fix: include stripe_customer_id · enables BillingPortalButton
        // for Free top-up-only users (Migration 0032).
        "display_name, locale, avatar_url, subscription_tier, credit_balance, credit_period_end, default_llm_provider, default_model, default_tier, created_at, adult_mode_enabled, is_age_verified, stripe_customer_id, theme_preference, default_story_language, notify_product, notify_marketing",
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("credit_ledger")
      .select("id, delta, balance_after, reason, ref_type, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("subscriptions")
      .select("tier, status, current_period_end, cancel_at_period_end, stripe_customer_id")
      .eq("user_id", user.id)
      // Wave 3 🔵 fix: order + limit · Migration 0030 dropped user_id UNIQUE
      // so a resubscribe-after-cancel user has multiple rows. maybeSingle()
      // without ordering picks an arbitrary row.
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = profileRes.data;
  const ledger = ledgerRes.data ?? [];
  const subscription = subRes.data;
  const subLive =
    subscription?.status === "active" || subscription?.status === "trialing";
  const tier = (
    subLive ? subscription?.tier ?? "free" : "free"
  ) as Tier;
  const tierConfig = TIER_CONFIG[tier];
  const balance = profile?.credit_balance ?? 0;
  const isAnonymous = (user as unknown as { is_anonymous?: boolean }).is_anonymous === true;

  const NAV = [
    { id: "profile", label: t("nav.profile"), icon: UserIcon },
    { id: "preferences", label: t("nav.preferences"), icon: SettingsIcon },
    { id: "adult", label: t("nav.adult"), icon: ShieldAlert },
    { id: "credits", label: t("nav.credits"), icon: Coins },
    { id: "account", label: t("nav.account"), icon: Info },
  ] as const;

  return (
    <>
      <SiteHeader />
      <main className="flex-1" style={{ background: "var(--se-bg)" }}>
        <div
          className="mx-auto px-4 sm:px-6 lg:px-14 py-10 pb-20"
          style={{ maxWidth: 1100 }}
        >
          {/* Audit Wave 2 B2: surface Stripe redirect status — was dead query params */}
          {sp.subscribed === "1" && (
            <BillingToast variant="subscribed" autoRefreshSeconds={8} />
          )}
          {sp.topup === "1" && (
            <BillingToast variant="topup" autoRefreshSeconds={8} />
          )}
          {sp.topup_canceled === "1" && (
            <BillingToast variant="topup_canceled" />
          )}
          {sp.verified === "pending" && (
            <BillingToast variant="verifying" autoRefreshSeconds={12} />
          )}
          <div className="flex items-baseline gap-3 mb-8">
            <h1
              className="text-3xl sm:text-4xl font-bold m-0 se-cjk"
              style={{
                letterSpacing: "-0.02em",
                color: "var(--se-fg)",
              }}
            >
              {t("pageTitle")}
            </h1>
            <span
              className="se-mono"
              style={{ fontSize: 11, color: "var(--se-fg-dim)" }}
            >
              @{profile?.display_name ?? user.email?.split("@")[0] ?? user.id.slice(0, 8)}
            </span>
          </div>

          {/* AUDIT FIX (P3-UX-L-17): anon claim CTA — convert guest to permanent */}
          {isAnonymous && (
            <div
              className="mb-7 rounded-xl p-4 flex items-start gap-3"
              style={{
                background: "var(--se-accent-bg)",
                border: "1px solid var(--se-accent-line)",
              }}
            >
              <UserIcon
                size={16}
                color="var(--se-accent)"
                className="mt-0.5 flex-none"
              />
              <div className="flex-1">
                <div
                  className="font-semibold text-sm se-cjk"
                  style={{ color: "var(--se-fg)" }}
                >
                  {t("anonBanner.title")}
                </div>
                <p
                  className="mt-1 text-xs se-cjk"
                  style={{
                    color: "var(--se-fg-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  {t("anonBanner.body")}
                </p>
                <Link
                  href={"/login" as never}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: "var(--se-fg)",
                    color: "var(--se-bg)",
                  }}
                >
                  {t("anonBanner.cta")}
                </Link>
              </div>
            </div>
          )}

          <div className="grid gap-9 lg:grid-cols-[180px_1fr]">
            {/* Sticky left nav — F1-F5 audit fix · designer sidebar pattern.
                Batch 4: deferred to lg so the 180px rail never compresses
                content at 768-820px tablet widths. */}
            <nav
              className="hidden lg:flex flex-col gap-0.5 sticky"
              style={{ top: 88, alignSelf: "start" }}
            >
              {NAV.map((n) => {
                const Ico = n.icon;
                return (
                  <a
                    key={n.id}
                    href={`#${n.id}`}
                    className="inline-flex items-center gap-2.5 px-3 py-2 rounded-md text-sm se-cjk transition-colors hover:bg-[color:var(--se-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      color: "var(--se-fg-2)",
                    }}
                  >
                    <Ico size={14} color="var(--se-fg-muted)" />
                    {n.label}
                  </a>
                );
              })}
            </nav>

            {/* Main content */}
            <div className="min-w-0 flex flex-col gap-9">
              <SettingsSection
                id="profile"
                title={t("profile.title")}
                sub={t("profile.subtitle")}
              >
                <SettingsCard>
                  <SettingsRow
                    label={t("profile.emailLabel")}
                    control={
                      <span className="se-mono text-xs" style={{ color: "var(--se-fg-2)" }}>
                        {user.email ?? t("profile.emailGuestPlaceholder")}
                      </span>
                    }
                  />
                  <SettingsRow
                    label={t("profile.displayNameLabel")}
                    control={
                      <DisplayNameEditor
                        initial={profile?.display_name?.trim() ?? ""}
                      />
                    }
                  />
                  <SettingsRow
                    label={t("profile.languageLabel")}
                    hint={t("profile.languageHint")}
                    control={<LocaleSwitcher align="right" />}
                  />
                  <SettingsRow
                    label={t("profile.joinedLabel")}
                    control={
                      <span className="se-mono text-xs" style={{ color: "var(--se-fg-muted)" }}>
                        {profile?.created_at
                          ? new Date(profile.created_at).toLocaleDateString(locale)
                          : "—"}
                      </span>
                    }
                    last
                  />
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                id="preferences"
                title={t("preferences.title")}
                sub={t("preferences.subtitle")}
              >
                <SettingsCard>
                  <SettingsRow
                    label={t("preferences.themeLabel")}
                    hint={t("preferences.themeHint")}
                    control={
                      <ThemeToggle
                        initial={
                          (profile?.theme_preference as
                            | "light"
                            | "dark"
                            | "system") ?? "system"
                        }
                      />
                    }
                  />
                  <SettingsRow
                    label={t("preferences.storyLangLabel")}
                    hint={t("preferences.storyLangHint")}
                    control={
                      <StoryLanguageSelect
                        initial={
                          (profile?.default_story_language as
                            | "zh-Hant"
                            | "zh-Hans"
                            | "en") ?? "auto"
                        }
                      />
                    }
                    last
                  />
                </SettingsCard>
                <div className="mt-3">
                  <SettingsCard>
                    <div className="px-5 py-4">
                      <NotificationPrefs
                        initialProduct={profile?.notify_product ?? true}
                        initialMarketing={profile?.notify_marketing ?? false}
                      />
                    </div>
                  </SettingsCard>
                </div>
              </SettingsSection>

              <SettingsSection
                id="adult"
                title={t("adult.title")}
                sub={t("adult.subtitle")}
              >
                <AdultModeToggle
                  initialEnabled={profile?.adult_mode_enabled ?? false}
                  isAgeVerified={profile?.is_age_verified ?? false}
                />
              </SettingsSection>

              <SettingsSection
                id="credits"
                title={t("credits.title")}
                sub={t("credits.subtitleFormat", {
                  tier: tierConfig.label,
                  balance: balance.toLocaleString(),
                })}
              >
                <SettingsCard>
                  <div
                    className="p-5"
                    style={{ background: "var(--se-surface)", borderBottom: "1px solid var(--se-border)" }}
                  >
                    <div
                      className="se-mono uppercase"
                      style={{ fontSize: 10, color: "var(--se-fg-dim)", letterSpacing: "0.06em" }}
                    >
                      {t("credits.balanceLabel")}
                    </div>
                    <div className="flex items-baseline gap-2 mt-1.5">
                      <span
                        className="se-mono"
                        style={{
                          fontSize: 32,
                          fontWeight: 600,
                          color: "var(--se-fg)",
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {balance.toLocaleString()}
                      </span>
                      <span className="text-sm" style={{ color: "var(--se-fg-muted)" }}>
                        {t("credits.balanceUnit")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                      <Badge variant="secondary" className="se-cjk">{tierConfig.label}</Badge>
                      <span className="se-cjk" style={{ color: "var(--se-fg-muted)" }}>
                        {/* Wave 2 i18n cycle-5 fix (2026-05-28): localize tier description.
                            Was reading hardcoded 繁中 `tierConfig.description` from credits.ts. */}
                        {t(`credits.tierDescriptions.${tier}` as
                          | "credits.tierDescriptions.free"
                          | "credits.tierDescriptions.adventurer"
                          | "credits.tierDescriptions.storyteller"
                          | "credits.tierDescriptions.legend")}
                      </span>
                    </div>
                    {subscription && (
                      <div className="mt-3 text-xs se-cjk" style={{ color: "var(--se-fg-muted)" }}>
                        {t("credits.subscriptionStatus")}
                        <span className="ml-1 font-medium" style={{ color: "var(--se-fg)" }}>
                          {subscription.status}
                        </span>
                        {subscription.current_period_end && (
                          <span className="ml-2">
                            · {t("credits.nextRenewal")}
                            {new Date(subscription.current_period_end).toLocaleDateString(locale)}
                          </span>
                        )}
                        {subscription.cancel_at_period_end && (
                          <Badge variant="destructive" className="ml-2 text-[10px]">
                            {t("credits.cancelAtPeriodEnd")}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {/* Phase 4 Stripe live (2026-05-27 · Wave 3 fix 2026-05-27):
                          - Has Stripe customer (sub OR top-up) → BillingPortalButton
                          - No Stripe customer → /pricing CTA
                          Sources: subscriptions row (paid users) OR profile column
                          (Free top-up-only users · Migration 0032). */}
                      {/* Settings overhaul (2026-06-01): in-app /plans page
                          instead of bouncing to marketing /pricing. Paid users
                          (have Stripe customer) get the portal too — manage /
                          cancel · founder PM review #4. */}
                      <Button
                        variant="default"
                        size="sm"
                        render={<Link href={"/plans" as never} />}
                      >
                        <CreditCard className="h-4 w-4" />
                        {tier === "free" ? t("credits.upgrade") : t("credits.viewPlans")}
                      </Button>
                      {(subscription?.stripe_customer_id ||
                        profile?.stripe_customer_id) && <BillingPortalButton />}
                    </div>
                    {/* One-time top-up packs (live 2026-05-27) */}
                    <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--se-border)" }}>
                      <TopUpButtons />
                    </div>
                  </div>
                  <div className="p-5">
                    <div
                      className="se-mono uppercase mb-2.5"
                      style={{ fontSize: 10, color: "var(--se-fg-dim)", letterSpacing: "0.06em" }}
                    >
                      {t("credits.recentLedger")}
                    </div>
                    {ledger.length === 0 ? (
                      <p className="text-xs se-cjk" style={{ color: "var(--se-fg-muted)" }}>
                        {t("credits.ledgerEmpty")}
                      </p>
                    ) : (
                      <div className="flex flex-col divide-y" style={{ borderColor: "var(--se-border)" }}>
                        {ledger.map((entry) => (
                          <div
                            key={entry.id}
                            className="flex items-center justify-between py-2.5 text-xs"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium se-cjk" style={{ color: "var(--se-fg)" }}>
                                {reasonLabel(entry.reason, t)}
                              </span>
                              <span className="se-mono" style={{ color: "var(--se-fg-dim)" }}>
                                {new Date(entry.created_at).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-right">
                              <span
                                className="se-mono font-semibold"
                                style={{
                                  color: entry.delta > 0 ? "var(--se-ok)" : "var(--se-danger)",
                                }}
                              >
                                {entry.delta > 0 ? "+" : ""}
                                {entry.delta}
                              </span>
                              <div
                                className="se-mono"
                                style={{ fontSize: 10, color: "var(--se-fg-dim)" }}
                              >
                                {t("credits.ledgerBalance", { balance: entry.balance_after })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SettingsCard>
              </SettingsSection>

              <SettingsSection id="account" title={t("account.title")} sub={t("account.subtitle")}>
                <SettingsCard>
                  <SettingsRow
                    label={t("account.signOutLabel")}
                    hint={t("account.signOutHint")}
                    control={<SignOutButton />}
                  />
                  <SettingsRow
                    label={t("account.exportLabel")}
                    hint={t("account.exportHint")}
                    control={<ExportDataButton />}
                  />
                  <SettingsRow
                    label={t("account.deleteLabel")}
                    hint={t("account.deleteHint")}
                    danger
                    control={<DeleteAccountButton />}
                    last
                  />
                </SettingsCard>

                {/* Support + legal — founder PM review #2/#3: app screens have no
                    footer, and we take real money, so these must be reachable
                    from settings. */}
                <div className="mt-3">
                  <SettingsCard>
                    <a
                      href={`mailto:${SUPPORT_EMAIL}`}
                      className="px-5 py-3.5 flex items-center gap-3 transition-colors hover:bg-[color:var(--se-surface-2)]"
                      style={{ borderBottom: "1px solid var(--se-border)" }}
                    >
                      <Mail size={15} style={{ color: "var(--se-fg-muted)" }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium se-cjk" style={{ color: "var(--se-fg)" }}>
                          {t("account.supportLabel")}
                        </div>
                        <div className="text-[11.5px] mt-0.5 se-cjk" style={{ color: "var(--se-fg-muted)" }}>
                          {SUPPORT_EMAIL}
                        </div>
                      </div>
                    </a>
                    <Link
                      href="/terms"
                      className="px-5 py-3.5 flex items-center gap-3 transition-colors hover:bg-[color:var(--se-surface-2)]"
                      style={{ borderBottom: "1px solid var(--se-border)" }}
                    >
                      <FileText size={15} style={{ color: "var(--se-fg-muted)" }} />
                      <span className="text-sm font-medium se-cjk" style={{ color: "var(--se-fg)" }}>
                        {t("account.termsLabel")}
                      </span>
                    </Link>
                    <Link
                      href="/privacy"
                      className="px-5 py-3.5 flex items-center gap-3 transition-colors hover:bg-[color:var(--se-surface-2)]"
                    >
                      <LockIcon size={15} style={{ color: "var(--se-fg-muted)" }} />
                      <span className="text-sm font-medium se-cjk" style={{ color: "var(--se-fg)" }}>
                        {t("account.privacyLabel")}
                      </span>
                    </Link>
                  </SettingsCard>
                </div>
              </SettingsSection>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
//  Atomic settings layout (designer's SettingsCard / SettingsRow pattern)
// ─────────────────────────────────────────────────────────────
function SettingsSection({
  id,
  title,
  sub,
  children,
}: {
  id: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <header className="mb-3.5">
        <h2
          className="text-lg sm:text-xl font-semibold m-0 se-cjk"
          style={{
            letterSpacing: "-0.015em",
            color: "var(--se-fg)",
          }}
        >
          {title}
        </h2>
        {sub && (
          <p
            className="mt-1 text-xs se-cjk m-0"
            style={{ color: "var(--se-fg-muted)" }}
          >
            {sub}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid var(--se-border)",
        background: "var(--se-surface)",
      }}
    >
      {children}
    </div>
  );
}

function SettingsRow({
  label,
  hint,
  control,
  danger,
  last,
}: {
  label: string;
  hint?: string;
  control: React.ReactNode;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className="px-5 py-3.5 flex items-center gap-4"
      style={{
        background: "var(--se-surface)",
        borderBottom: last ? undefined : "1px solid var(--se-border)",
      }}
    >
      <div className="flex-1 min-w-0">
        <div
          className="text-sm font-medium se-cjk"
          style={{ color: danger ? "var(--se-danger)" : "var(--se-fg)" }}
        >
          {label}
        </div>
        {hint && (
          <div
            className="text-[11.5px] mt-1 se-cjk"
            style={{ color: "var(--se-fg-muted)", lineHeight: 1.55 }}
          >
            {hint}
          </div>
        )}
      </div>
      <div className="flex-none">{control}</div>
    </div>
  );
}

/**
 * Wave 2 i18n migration (2026-05-27): localized via `settings.ledger.*` catalog.
 * Was hardcoded 繁中 labels — EN / zh-Hans users saw Cantonese reason labels
 * in their credit history.
 */
type LedgerKey =
  | "turn_charge"
  | "story_charge"
  | "embed_charge"
  | "sub_grant"
  | "sub_renewal"
  | "sub_canceled"
  | "topup"
  | "refund"
  | "admin_adjust"
  | "free_tier_refresh";

function reasonLabel(
  reason: string,
  t: (key: string) => string,
): string {
  const KNOWN: ReadonlyArray<LedgerKey> = [
    "turn_charge",
    "story_charge",
    "embed_charge",
    "sub_grant",
    "sub_renewal",
    "sub_canceled",
    "topup",
    "refund",
    "admin_adjust",
    "free_tier_refresh",
  ];
  if (KNOWN.includes(reason as LedgerKey)) {
    return t(`ledger.${reason}`);
  }
  return reason;
}
