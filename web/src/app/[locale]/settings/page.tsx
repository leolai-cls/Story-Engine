import { setRequestLocale, getLocale } from "next-intl/server";
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { TIER_CONFIG, type Tier } from "@/lib/billing/credits";
import { ModelPicker } from "@/components/settings/model-picker";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { AdultModeToggle } from "@/components/settings/adult-mode-toggle";

export const dynamic = "force-dynamic";

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
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

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
        "display_name, locale, avatar_url, subscription_tier, credit_balance, credit_period_end, default_llm_provider, default_model, created_at, adult_mode_enabled, is_age_verified",
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
      .select("tier, status, current_period_end, cancel_at_period_end")
      .eq("user_id", user.id)
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
    { id: "profile", label: "個人資料", icon: UserIcon },
    { id: "preferences", label: "偏好", icon: SettingsIcon },
    { id: "adult", label: "成人模式", icon: ShieldAlert },
    { id: "credits", label: "Credits", icon: Coins },
    { id: "account", label: "帳號", icon: Info },
  ] as const;

  return (
    <>
      <SiteHeader />
      <main className="flex-1" style={{ background: "var(--se-bg)" }}>
        <div
          className="mx-auto px-4 sm:px-6 lg:px-14 py-10 pb-20"
          style={{ maxWidth: 1100 }}
        >
          <div className="flex items-baseline gap-3 mb-8">
            <h1
              className="text-3xl font-bold m-0 se-cjk"
              style={{
                letterSpacing: "-0.02em",
                color: "var(--se-fg)",
              }}
            >
              設定
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
                  你而家係訪客模式
                </div>
                <p
                  className="mt-1 text-xs se-cjk"
                  style={{
                    color: "var(--se-fg-muted)",
                    lineHeight: 1.6,
                  }}
                >
                  連結 email 鎖定進度同 credit 餘額 — 唔連結 · 清 browser cookies 之後故事會失去。
                </p>
                <Link
                  href={"/login" as never}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: "var(--se-fg)",
                    color: "var(--se-bg)",
                  }}
                >
                  立即註冊 / 連結 email
                </Link>
              </div>
            </div>
          )}

          <div
            className="grid gap-9"
            style={{ gridTemplateColumns: "180px 1fr" }}
          >
            {/* Sticky left nav — F1-F5 audit fix · designer sidebar pattern */}
            <nav
              className="hidden md:flex flex-col gap-0.5 sticky"
              style={{ top: 88, alignSelf: "start" }}
            >
              {NAV.map((n) => {
                const Ico = n.icon;
                return (
                  <a
                    key={n.id}
                    href={`#${n.id}`}
                    className="inline-flex items-center gap-2.5 px-3 py-2 rounded-md text-sm se-cjk transition-colors hover:bg-[color:var(--se-surface-2)]"
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
                title="個人資料"
                sub="登入帳戶 · 顯示名稱 · 語言"
              >
                <SettingsCard>
                  <SettingsRow
                    label="Email"
                    control={
                      <span className="se-mono text-xs" style={{ color: "var(--se-fg-2)" }}>
                        {user.email ?? "（訪客 / 匿名登入）"}
                      </span>
                    }
                  />
                  <SettingsRow
                    label="顯示名稱"
                    control={
                      <span className="text-sm se-cjk" style={{ color: "var(--se-fg)" }}>
                        {profile?.display_name?.trim() || "—"}
                      </span>
                    }
                  />
                  <SettingsRow
                    label="語言"
                    hint="影響 UI 文字 · 個別故事嘅 narrative language 喺 creation 時揀"
                    control={
                      <span className="se-mono text-xs" style={{ color: "var(--se-fg-2)" }}>
                        {profile?.locale ?? "zh-Hant"}
                      </span>
                    }
                  />
                  <SettingsRow
                    label="加入日期"
                    control={
                      <span className="se-mono text-xs" style={{ color: "var(--se-fg-muted)" }}>
                        {profile?.created_at
                          ? new Date(profile.created_at).toLocaleDateString()
                          : "—"}
                      </span>
                    }
                    last
                  />
                </SettingsCard>
              </SettingsSection>

              <SettingsSection
                id="preferences"
                title="偏好"
                sub="預設敘事 model · 新開 playthrough 嘅 default · adult mode 影響 NSFW 可選性"
              >
                <ModelPicker
                  currentModelId={profile?.default_model ?? "claude-sonnet-4-6"}
                  tier={tier}
                  adultModeEnabled={profile?.adult_mode_enabled ?? false}
                />
              </SettingsSection>

              <SettingsSection
                id="adult"
                title="成人模式"
                sub="法律要求 · CSAM/illegal pre-filter 永遠 on · 無論開唔開都會 enforce"
              >
                <AdultModeToggle
                  initialEnabled={profile?.adult_mode_enabled ?? false}
                  isAgeVerified={profile?.is_age_verified ?? false}
                />
              </SettingsSection>

              <SettingsSection
                id="credits"
                title="Credits"
                sub={`當前 ${tierConfig.label} · 餘額 ${balance.toLocaleString()} credits · Phase 4 money tier 開放 top-up`}
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
                      BALANCE
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
                        credits
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                      <Badge variant="secondary" className="se-cjk">{tierConfig.label}</Badge>
                      <span className="se-cjk" style={{ color: "var(--se-fg-muted)" }}>
                        {tierConfig.description}
                      </span>
                    </div>
                    {subscription && (
                      <div className="mt-3 text-xs se-cjk" style={{ color: "var(--se-fg-muted)" }}>
                        訂閱狀態：
                        <span className="ml-1 font-medium" style={{ color: "var(--se-fg)" }}>
                          {subscription.status}
                        </span>
                        {subscription.current_period_end && (
                          <span className="ml-2">
                            · 下次續期：
                            {new Date(subscription.current_period_end).toLocaleDateString()}
                          </span>
                        )}
                        {subscription.cancel_at_period_end && (
                          <Badge variant="destructive" className="ml-2 text-[10px]">
                            期末取消
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-4">
                      <Button variant="default" size="sm" disabled>
                        <CreditCard className="h-4 w-4" />
                        升級訂閱
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        購買 Top-up
                      </Button>
                      <span
                        className="se-mono ml-auto self-center"
                        style={{
                          fontSize: 10.5,
                          padding: "2px 7px",
                          borderRadius: 3,
                          background: "var(--se-surface-2)",
                          color: "var(--se-fg-dim)",
                        }}
                      >
                        top-up · Phase 4
                      </span>
                    </div>
                  </div>
                  <div className="p-5">
                    <div
                      className="se-mono uppercase mb-2.5"
                      style={{ fontSize: 10, color: "var(--se-fg-dim)", letterSpacing: "0.06em" }}
                    >
                      最近 CREDIT 變動
                    </div>
                    {ledger.length === 0 ? (
                      <p className="text-xs se-cjk" style={{ color: "var(--se-fg-muted)" }}>
                        未有任何 credit 變動。
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
                                {reasonLabel(entry.reason)}
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
                                餘 {entry.balance_after}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SettingsCard>
              </SettingsSection>

              <SettingsSection id="account" title="帳號" sub="登出 · 匯出 data · 刪除帳號">
                <SettingsCard>
                  <SettingsRow
                    label="登出"
                    hint="所有裝置同時登出"
                    control={<SignOutButton />}
                  />
                  <SettingsRow
                    label="匯出我嘅 data"
                    hint="所有 playthrough · 記憶 · 評論 · ~zip 檔"
                    control={
                      <Button variant="outline" size="sm" disabled>
                        匯出（v1.5+）
                      </Button>
                    }
                  />
                  <SettingsRow
                    label="刪除帳號"
                    hint="不可逆 · 所有故事 · playthrough · 記憶會永久消失"
                    danger
                    control={
                      <Button variant="destructive" size="sm" disabled>
                        刪除...
                      </Button>
                    }
                    last
                  />
                </SettingsCard>
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
          className="text-lg font-semibold m-0 se-cjk"
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

function reasonLabel(reason: string): string {
  switch (reason) {
    case "turn_charge":
      return "玩 turn 扣費";
    case "story_charge":
      return "創作新故事";
    case "embed_charge":
      return "Embed 用量";
    case "sub_grant":
      return "訂閱開通 credit";
    case "sub_renewal":
      return "訂閱續期 credit";
    case "sub_canceled":
      return "訂閱取消";
    case "topup":
      return "Top-up 購買";
    case "refund":
      return "退回";
    case "admin_adjust":
      return "管理員調整";
    case "free_tier_refresh":
      return "Free tier 每日重置";
    default:
      return reason;
  }
}
