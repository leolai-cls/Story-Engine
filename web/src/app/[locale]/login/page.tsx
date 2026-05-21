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
import { Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { signInWithEmail } from "./actions";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.login");
  const tMagic = await getTranslations("auth.magicLink");
  const sp = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-bold mx-auto mb-3"
          >
            <Sparkles className="h-5 w-5 text-primary" />
            <span>Story Engine</span>
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
              <Button type="submit" className="w-full">
                {t("submit")}
              </Button>
              {sp.error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                  {decodeURIComponent(sp.error)}
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

          <Button variant="outline" className="w-full" disabled>
            {t("googleButton")}{" "}
            <span className="text-muted-foreground text-xs ml-1">
              (Phase 6)
            </span>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
