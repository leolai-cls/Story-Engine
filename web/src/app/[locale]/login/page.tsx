import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { KieioLogo } from "@/components/brand/KieioLogo";
import { signInWithEmail, signInAsGuest, signInWithGoogle } from "./actions";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string; error?: string; next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.login");
  const tMagic = await getTranslations("auth.magicLink");
  const sp = await searchParams;
  // AUDIT FIX MG-UX-HIGH-01: forward ?next= into the action so anon users who
  // hit /my, /memory, etc. get returned to their destination after login. Same
  // safety contract as auth/callback (relative path only, ≤200 chars).
  const safeNext =
    typeof sp.next === "string" &&
    sp.next.startsWith("/") &&
    !sp.next.startsWith("//") &&
    !sp.next.startsWith("/\\") &&
    sp.next.length <= 200 &&
    !/^\/?[a-z]+:/i.test(sp.next)
      ? sp.next
      : "";

  // Map raw error codes from server actions / auth callback into user-friendly
  // 繁中 messages. Unknown codes fall through to raw display (existing pattern).
  const ERROR_MESSAGES: Record<string, string> = {
    email_required: "請輸入 email",
    otp_failed: "Magic link 發送失敗，請稍後再試",
    callback_failed: "登入回呼失敗，請重新登入",
    missing_code: "登入連結唔正確或過期",
    google_unavailable: "Google 登入暫未啟用，請用 email magic link",
  };
  const errorText = sp.error
    ? (ERROR_MESSAGES[sp.error] ?? decodeURIComponent(sp.error))
    : null;

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-4">
          <Link
            href="/"
            aria-label="Kieio · home"
            className="inline-flex items-center mx-auto mb-3"
            style={{ color: "var(--se-fg)" }}
          >
            {/* Brandbook v4 locked: (o) KIEIO lockup */}
            <KieioLogo size={18} markColor="purple" wordColor="default" />
          </Link>
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sp.sent ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center dark:border-green-900 dark:bg-green-950/40">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
              <p className="text-sm font-semibold mb-1">{tMagic("title")}</p>
              <p className="text-xs text-muted-foreground">
                {tMagic("body", { email: sp.sent })}
              </p>
            </div>
          ) : (
            <form action={signInWithEmail} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">{t("emailLabel")}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t("emailPlaceholder")}
                  required
                  autoComplete="email"
                />
              </div>
              {safeNext && (
                <input type="hidden" name="next" value={safeNext} />
              )}
              <Button type="submit" className="w-full">
                {t("submit")}
              </Button>
              {errorText && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                  {errorText}
                </div>
              )}
            </form>
          )}

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-card px-2 text-xs text-muted-foreground">
              {t("or")}
            </span>
          </div>

          {/* Google OAuth · Supabase native provider · config in Supabase
              dashboard + Google Cloud Console (one-time founder setup). */}
          <form action={signInWithGoogle}>
            {safeNext && (
              <input type="hidden" name="next" value={safeNext} />
            )}
            <Button
              type="submit"
              variant="outline"
              className="w-full gap-2"
            >
              {/* Inline Google brand mark — lucide-react doesn't ship one and
                  Google's brand guidelines require the full multi-color "G"
                  for OAuth buttons. */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
              >
                <path
                  fill="#4285F4"
                  d="M21.35 11.1H12v3.2h5.35c-.24 1.27-.96 2.34-2.04 3.06v2.55h3.3c1.93-1.78 3.04-4.4 3.04-7.51 0-.66-.07-1.32-.2-1.97z"
                />
                <path
                  fill="#34A853"
                  d="M12 22c2.76 0 5.07-.91 6.76-2.46l-3.3-2.55c-.92.61-2.09.98-3.46.98-2.66 0-4.92-1.79-5.72-4.2H2.86v2.63A9.99 9.99 0 0012 22z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.28 13.77a5.99 5.99 0 010-3.79V7.35H2.86a10 10 0 000 9.05l3.42-2.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.96c1.5 0 2.85.52 3.91 1.53l2.93-2.93C17.06 2.96 14.76 2 12 2 7.7 2 3.99 4.47 2.86 7.94l3.42 2.63C7.08 7.75 9.34 5.96 12 5.96z"
                />
              </svg>
              {t("googleButton")}
            </Button>
          </form>

          <div className="pt-2">
            <form action={signInAsGuest}>
              {safeNext && (
                <input type="hidden" name="next" value={safeNext} />
              )}
              <Button
                type="submit"
                variant="outline"
                className="w-full"
              >
                <Zap className="h-4 w-4" />
                一鍵 Guest 試玩
              </Button>
            </form>
            {/* Honest copy (UI tier audit fix · designer 2.3):
                anonymous-to-permanent upgrade flow not yet wired (Supabase
                auth.linkIdentity() API exists but app hasn't built migration
                UX). Don't promise data link until backend supports it. */}
            <p className="text-[11px] text-center text-muted-foreground mt-2">
              無需信用卡 · 即時開始 · Guest 用獨立 credit
              <br />
              想長期保存 playthrough · sign up 用 email 開新 account
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
