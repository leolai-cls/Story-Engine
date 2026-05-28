import { setRequestLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-user";
import { getLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CreationForm } from "./creation-form";

export default async function NewStoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ seed?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("createStory");

  // Gate: require login. AUDIT FIX MG-PERF-HIGH-01: cached — SiteHeader
  // dedupes against this call (saves a Supabase auth roundtrip).
  const user = await getCachedUser();
  if (!user) {
    const l = await getLocale();
    redirect({ href: "/login", locale: l });
  }
  const supabase = await createClient();

  // Phase 6 non-money function: gate adult content_rating on adult_mode_enabled
  const { data: profile } = await supabase
    .from("profiles")
    .select("adult_mode_enabled")
    .eq("id", user!.id)
    .single();
  const adultModeEnabled = profile?.adult_mode_enabled ?? false;

  // Session 16 follow-up (new-user activation lobby · 2026-05-28):
  // Accept ?seed=<encoded prompt> so /my lobby cards can deep-link with
  // a pre-filled example scenario. Sanitize: clamp to 2000 chars (same
  // as form maxLength · prevents URL-stuffing attacks).
  const sp = await searchParams;
  const initialPrompt = (sp.seed ?? "").slice(0, 2000);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 container mx-auto max-w-3xl px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            {t("pageTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("pageBody")}</p>
        </div>

        <CreationForm
          adultModeEnabled={adultModeEnabled}
          initialPrompt={initialPrompt}
        />
      </main>
      <SiteFooter />
    </>
  );
}
