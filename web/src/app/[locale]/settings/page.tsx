import { setRequestLocale, getLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Coins, User as UserIcon, CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TIER_CONFIG, type Tier } from "@/lib/billing/credits";
import { ModelPicker } from "@/components/settings/model-picker";
import { SignOutButton } from "@/components/settings/sign-out-button";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const l = await getLocale();
    redirect({ href: "/login", locale: l });
    throw new Error("unreachable");
  }

  // Load profile + recent credit history
  const [profileRes, ledgerRes, subRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, locale, avatar_url, subscription_tier, credit_balance, credit_period_end, default_llm_provider, default_model, created_at",
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

  // AUDIT FIX (P3-LOGIC-H-06): canceled subs lose tier. Only 'active' or
  // 'trialing' subscription rows count; otherwise fall back to profile
  // tier — but if profile says paid + sub canceled, force free.
  const subLive =
    subscription?.status === "active" || subscription?.status === "trialing";
  const tier = (
    subLive
      ? subscription?.tier ?? "free"
      : ((profile?.subscription_tier as Tier | undefined) ?? "free") === "free"
      ? "free"
      : "free"
  ) as Tier;
  const tierConfig = TIER_CONFIG[tier];
  const balance = profile?.credit_balance ?? 0;
  // AUDIT FIX (P3-UX-L-17): anon claim CTA. is_anonymous flag is
  // populated by Supabase Auth on anonymous sign-ins.
  const isAnonymous = (user as unknown as { is_anonymous?: boolean }).is_anonymous === true;

  return (
    <>
      <SiteHeader />
      <main className="flex-1 container mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight mb-2">設定</h1>
        <p className="text-muted-foreground mb-8">
          帳戶、訂閱、模型偏好。
        </p>

        {/* AUDIT FIX (P3-UX-L-17): anon claim CTA — convert guest to permanent */}
        {isAnonymous && (
          <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <UserIcon className="h-5 w-5 flex-shrink-0 text-primary" />
              <div className="flex-1">
                <div className="font-semibold text-sm">你而家係訪客模式</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  連結 email 鎖定進度同 credit 餘額 — 唔連結，清 browser cookies 之後故事會失去。
                </p>
                <Link
                  href={"/login" as never}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  立即註冊 / 連結 email
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6">
          {/* ─── Profile ──────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <UserIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">個人資料</CardTitle>
                    <CardDescription className="text-xs">登入帳戶資訊</CardDescription>
                  </div>
                </div>
                <SignOutButton />
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span>{user.email ?? "（訪客 / 匿名登入）"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">顯示名稱</span>
                <span>{profile?.display_name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">語言</span>
                <span>{profile?.locale ?? "zh-Hant"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">加入</span>
                <span>
                  {profile?.created_at
                    ? new Date(profile.created_at).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* ─── Credits + Subscription ────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Credits + 訂閱</CardTitle>
                  <CardDescription className="text-xs">
                    當前 {tierConfig.label} · 餘額 {balance.toLocaleString()} credits
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Big balance card */}
              <div className="rounded-lg border bg-card p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  剩餘 Credits
                </div>
                <div className="mt-1 text-3xl font-bold text-amber-600 dark:text-amber-300">
                  {balance.toLocaleString()}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{tierConfig.label}</Badge>
                  <span>{tierConfig.description}</span>
                </div>
                {subscription && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    訂閱狀態：
                    <span className="ml-1 font-medium">{subscription.status}</span>
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
              </div>

              {/* Upgrade CTA */}
              <div className="flex flex-wrap gap-2">
                <Button variant="default" size="sm" disabled>
                  <CreditCard className="h-4 w-4" />
                  升級訂閱 (Phase 4 嚟緊)
                </Button>
                <Button variant="outline" size="sm" disabled>
                  購買 Top-up (Phase 4 嚟緊)
                </Button>
              </div>

              {/* Recent ledger */}
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  最近 Credit 變動
                </div>
                {ledger.length === 0 ? (
                  <p className="text-xs text-muted-foreground">未有任何 credit 變動。</p>
                ) : (
                  <div className="divide-y rounded-md border text-xs">
                    {ledger.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between px-3 py-2"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{reasonLabel(entry.reason)}</span>
                          <span className="text-muted-foreground">
                            {new Date(entry.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-right">
                          <span
                            className={
                              entry.delta > 0
                                ? "font-mono font-semibold text-emerald-600 dark:text-emerald-300"
                                : "font-mono font-semibold text-rose-600 dark:text-rose-300"
                            }
                          >
                            {entry.delta > 0 ? "+" : ""}
                            {entry.delta}
                          </span>
                          <div className="text-muted-foreground">
                            餘 {entry.balance_after}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ─── Model picker ──────────────────────────────────────────── */}
          <ModelPicker
            currentModelId={profile?.default_model ?? "claude-sonnet-4-6"}
            tier={tier}
          />
        </div>
      </main>
      <SiteFooter />
    </>
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
