import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CreationForm } from "./creation-form";

export default async function NewStoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Gate: require login
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const l = await getLocale();
    redirect({ href: "/login", locale: l });
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1 container mx-auto max-w-3xl px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            創作你嘅故事
          </h1>
          <p className="text-muted-foreground text-sm">
            描述你想玩嘅故事 — 任何 genre / 文化 setting / 主角設定都得。AI 會即場為你設計：故事介面、世界觀規則、3-5 個有人格嘅 NPC、開場敘事。
          </p>
        </div>

        <CreationForm />
      </main>
      <SiteFooter />
    </>
  );
}
