import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DynamicStatePanel } from "@/components/state-panel";
import {
  type StateSchema,
  initialStateFromSchema,
} from "@/schemas/state-schema";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// Session 16 audit MED-03 fix: /dev/* routes are internal-only — hide from
// search engines and gate access in production. The page contained
// customer-facing competitor positioning that violated CLAUDE.md hard rule
// #34 (no internal strategy leak to end users).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Hardcoded sample schemas to show how DynamicStatePanel renders different
// genres. Same component, different schema → completely different UI.

const ROMANCE_SCHEMA: StateSchema = {
  fields: [
    {
      key: "linsiya_affinity",
      label: "林思雅 好感度",
      render_hint: "progress_ring",
      default: 30,
    },
    {
      key: "chenjiaming_affinity",
      label: "陳家明 好感度",
      render_hint: "progress_ring",
      default: 15,
    },
    {
      key: "mood",
      label: "心情",
      render_hint: "enum_chip",
      options: ["緊張", "開心", "平靜", "難過", "興奮", "尷尬"],
      default: "緊張",
    },
    {
      key: "money",
      label: "零用錢",
      render_hint: "number",
      default: 320,
    },
    {
      key: "gifts_given",
      label: "送過嘅禮物",
      render_hint: "inventory_list",
      default: [{ name: "鮮花", icon: "💐", count: 1 }],
    },
    {
      key: "diary",
      label: "今日日記",
      render_hint: "note",
      default: "今日係轉校第三日，我企喺校門口望住嗰兩個女仔…",
    },
  ],
};

const DND_SCHEMA: StateSchema = {
  fields: [
    {
      key: "hp",
      label: "HP",
      render_hint: "bar",
      max: 60,
      default: 42,
    },
    {
      key: "mp",
      label: "MP",
      render_hint: "bar",
      max: 30,
      default: 18,
    },
    {
      key: "stamina",
      label: "體力",
      render_hint: "meter_with_label",
      max: 100,
      default: 78,
    },
    {
      key: "strength",
      label: "力量",
      render_hint: "number",
      default: 14,
    },
    {
      key: "dexterity",
      label: "敏捷",
      render_hint: "number",
      default: 16,
    },
    {
      key: "intelligence",
      label: "智力",
      render_hint: "number",
      default: 12,
    },
    {
      key: "experience",
      label: "經驗值",
      render_hint: "number",
      default: 2340,
    },
    {
      key: "inventory",
      label: "背包",
      render_hint: "inventory_list",
      default: [
        { name: "長劍", icon: "⚔️", count: 1 },
        { name: "治療藥水", icon: "🧪", count: 3 },
        { name: "黃金", icon: "💰", count: 250 },
      ],
    },
  ],
};

const NBA_SCHEMA: StateSchema = {
  fields: [
    {
      key: "energy",
      label: "體力",
      render_hint: "meter_with_label",
      max: 100,
      default: 82,
    },
    {
      key: "ppg",
      label: "場均得分",
      render_hint: "number",
      default: 18,
    },
    {
      key: "rpg",
      label: "場均籃板",
      render_hint: "number",
      default: 5,
    },
    {
      key: "apg",
      label: "場均助攻",
      render_hint: "number",
      default: 6,
    },
    {
      key: "coach_trust",
      label: "教練信任度",
      render_hint: "enum_chip",
      options: ["低", "中等", "高", "完全信任"],
      default: "中等",
    },
    {
      key: "teammates",
      label: "隊友關係",
      render_hint: "relationship_graph",
      default: {
        阿明: 65,
        Big_C: 40,
        小川: -10,
        Kobe_Jr: 80,
      },
    },
    {
      key: "season_log",
      label: "賽季筆記",
      render_hint: "note",
      default: "首節打得唔錯，但第三節體力下跌，教練換我落場。",
    },
  ],
};

export default async function StateDemoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Session 16 audit MED-03 fix: gate /dev/* behind NODE_ENV !== 'production'.
  // Was accessible on prod (kieio.com / app.kieio.com) to anyone with the URL.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const { locale } = await params;
  setRequestLocale(locale);

  const romanceState = initialStateFromSchema(ROMANCE_SCHEMA);
  const dndState = initialStateFromSchema(DND_SCHEMA);
  const nbaState = initialStateFromSchema(NBA_SCHEMA);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 container mx-auto max-w-7xl px-4 sm:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            故事自適應介面 — Demo
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            同一個 DynamicStatePanel component 渲染 3 個完全唔同 genre
            嘅故事狀態。每個故事 AI 為你自動 generate state_schema。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section>
            <h2 className="text-base font-bold mb-2 flex items-center gap-2">
              💕 戀愛校園
            </h2>
            <DynamicStatePanel
              schema={ROMANCE_SCHEMA}
              state={romanceState}
              title="主角狀態"
            />
          </section>
          <section>
            <h2 className="text-base font-bold mb-2 flex items-center gap-2">
              ⚔️ D&D 冒險
            </h2>
            <DynamicStatePanel
              schema={DND_SCHEMA}
              state={dndState}
              title="角色卡"
            />
          </section>
          <section>
            <h2 className="text-base font-bold mb-2 flex items-center gap-2">
              🏀 NBA 新秀
            </h2>
            <DynamicStatePanel
              schema={NBA_SCHEMA}
              state={nbaState}
              title="球員 stats"
            />
          </section>
        </div>

        <div className="mt-12 p-5 rounded-xl bg-primary/5 border border-primary/20">
          <p className="text-sm text-ink-soft">
            <strong className="text-foreground">點解咁特別:</strong> 每個故事
            都有屬於自己嘅介面 —— state_schema 描述「呢個故事有咩 field、
            用咩 render_hint」，DynamicStatePanel 按 hint 派 9 個 atomic
            component 去畫。AI 為新故事 generate schema 嗰陣，介面自然就跟住變。
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
