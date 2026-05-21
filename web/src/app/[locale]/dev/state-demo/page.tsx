import { setRequestLocale } from "next-intl/server";
import { DynamicStatePanel } from "@/components/state-panel";
import {
  type StateSchema,
  initialStateFromSchema,
} from "@/schemas/state-schema";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

/* eslint-disable @typescript-eslint/no-explicit-any */

// =============================================================================
// Demo schemas — hardcoded examples of 3 different story genres to show
// that the SAME DynamicStatePanel component renders completely different
// UIs based purely on the schema's render_hints. This is the "故事自適應介面"
// feature in action.
// =============================================================================

const ROMANCE_SCHEMA: StateSchema = {
  version: "story-engine/state/v1",
  fields: [
    {
      key: "linsiya_affinity",
      label: "林思雅 好感度",
      render_hint: "progress_ring",
      min: 0,
      max: 100,
      default: 30,
      color: "rose",
      description: "你嘅初戀候選",
    },
    {
      key: "chenjiaming_affinity",
      label: "陳家明 好感度",
      render_hint: "progress_ring",
      min: 0,
      max: 100,
      default: 15,
      color: "purple",
      description: "好朋友定…？",
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
      prefix: "HK$",
    },
    {
      key: "gifts_given",
      label: "送過嘅禮物",
      render_hint: "inventory_list",
      default: [{ name: "鮮花", icon: "💐", count: 1 }],
      max_items: 10,
    },
    {
      key: "diary",
      label: "今日日記",
      render_hint: "note",
      default: "今日係轉校第三日，我企喺校門口望住嗰兩個女仔…",
      max_length: 500,
    },
  ],
};

const DND_SCHEMA: StateSchema = {
  version: "story-engine/state/v1",
  fields: [
    {
      key: "hp",
      label: "HP",
      render_hint: "bar",
      min: 0,
      max: 60,
      default: 42,
      color: "red",
    },
    {
      key: "mp",
      label: "MP",
      render_hint: "bar",
      min: 0,
      max: 30,
      default: 18,
      color: "blue",
    },
    {
      key: "stamina",
      label: "體力",
      render_hint: "meter_with_label",
      min: 0,
      max: 100,
      default: 78,
      unit: "%",
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
      suffix: " XP",
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
      max_items: 20,
    } as any,
  ],
};

const NBA_SCHEMA: StateSchema = {
  version: "story-engine/state/v1",
  fields: [
    {
      key: "energy",
      label: "體力",
      render_hint: "meter_with_label",
      min: 0,
      max: 100,
      default: 82,
      unit: "%",
    },
    {
      key: "ppg",
      label: "場均得分",
      render_hint: "number",
      default: 18.2,
      suffix: " 分",
    },
    {
      key: "rpg",
      label: "場均籃板",
      render_hint: "number",
      default: 5.1,
    },
    {
      key: "apg",
      label: "場均助攻",
      render_hint: "number",
      default: 6.4,
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
      max_length: 500,
    },
  ],
};

export default async function StateDemoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
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
            嘅故事狀態。將來每個用戶創作嘅故事 AI 會自動 generate
            適合嗰個故事嘅 state_schema —— 戀愛有好感度環、D&D 有
            HP/MP 條、NBA 有球員數據。Phase 1 之後呢個 schema 由 LLM 生成，唔再 hardcode。
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
            <strong className="text-foreground">點解咁特別:</strong> 對手平台
            (AI Dungeon, Character.AI)
            嘅介面係硬寫死嘅。我哋將狀態結構同渲染解耦 —— state_schema 描述
            「呢個故事有咩 field、用咩 render_hint」，DynamicStatePanel
            按 hint 派 9 個 atomic component 去畫。將來 AI 為新故事 generate
            schema 嗰陣，介面自然就跟住變。
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
