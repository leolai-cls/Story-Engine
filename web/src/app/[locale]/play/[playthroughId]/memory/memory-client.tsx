"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { X, Sparkles, BookOpen, NotebookPen, Info, Play, Clock, Lock, Drama } from "lucide-react";
import { CsamStrip } from "@/components/se/CsamStrip";

type Summary = {
  id: string;
  range: string;
  body: string;
  writtenAt: string;
};

type LoreRow = {
  id: string;
  entity_type: string;
  name: string;
  description: string;
  keywords: string[];
  always_on: boolean;
  updated_at: string;
  created_at: string;
};

const ENTITY_LABEL: Record<string, string> = {
  character: "人物",
  place: "地點",
  item: "物品",
  event: "事件",
  concept: "概念",
};

const ENTITY_HUE: Record<string, number> = {
  character: 340,
  place: 200,
  item: 80,
  event: 25,
  concept: 280,
};

type Tab = "active" | "summaries" | "lorebook" | "inner-voices";

// Session 14 · NPC L3 inner thought · grouped by NPC name on backend route
type NpcInnerThought = {
  id: string;
  turnIndex: number;
  innerThought: string;
  intent: string;
  createdAt: string;
};

export function MemoryJournalClient({
  playthroughId,
  turnCount,
  protagonist,
  storyTitle,
  locale,
  summaries,
  lorebook,
  npcInnerVoices = {},
  showCsam = false,
}: {
  playthroughId: string;
  turnCount: number;
  protagonist: string;
  storyTitle: string;
  locale: string;
  summaries: Summary[];
  lorebook: LoreRow[];
  /** Session 14 · NPC L3 inner thoughts grouped by NPC name · empty when L3 unused */
  npcInnerVoices?: Record<string, NpcInnerThought[]>;
  /** D5 audit · show CSAM strip when in adult content context */
  showCsam?: boolean;
}) {
  // Default tab = active (the killer demo per CLAUDE.md hard rule #7)
  const [tab, setTab] = useState<Tab>("active");

  // Group lorebook by type
  const types = ["character", "place", "item", "event", "concept"] as const;
  const grouped: Record<string, LoreRow[]> = {};
  types.forEach((t) => (grouped[t] = []));
  lorebook.forEach((row) => {
    if (grouped[row.entity_type]) grouped[row.entity_type].push(row);
  });
  const lorebookCount = lorebook.length;

  // Session 14 · NPC inner voices count + ordered NPC names
  // F-07 audit fix: sort by thought count desc (most-developed NPC first)
  // instead of alphabetical · improves first-impression for marquee feature
  const npcNames = Object.keys(npcInnerVoices).sort(
    (a, b) =>
      (npcInnerVoices[b]?.length ?? 0) - (npcInnerVoices[a]?.length ?? 0),
  );
  const innerVoicesCount = Object.values(npcInnerVoices).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--se-bg)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-3.5 px-6 sm:px-12"
        style={{
          height: 64,
          background: "var(--se-bg-elev)",
          borderBottom: "1px solid var(--se-border)",
        }}
      >
        <Link
          href={`/play/${playthroughId}` as never}
          locale={locale}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs"
          style={{
            color: "var(--se-fg-muted)",
            border: "1px solid var(--se-border)",
          }}
        >
          <X size={12} />
          返扮演
        </Link>
        <div style={{ width: 1, height: 18, background: "var(--se-border)" }} />
        <div>
          <h1
            className="m-0 text-sm font-semibold se-cjk"
            style={{ color: "var(--se-fg)" }}
          >
            你呢次扮演 {protagonist} 嘅記憶
          </h1>
          <div
            className="se-mono mt-0.5"
            style={{ fontSize: 10.5, color: "var(--se-fg-dim)", letterSpacing: "0.04em" }}
          >
            {storyTitle.toUpperCase()} · TURN {turnCount} · 唯讀 · 只有你睇到 · FORK 多一次係空白
          </div>
        </div>
        <div className="flex-1" />
        <Link
          href={`/play/${playthroughId}` as never}
          locale={locale}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
          style={{
            background: "var(--se-fg)",
            color: "var(--se-bg)",
          }}
        >
          <Play size={11} />
          繼續扮演
        </Link>
      </div>

      {/* D6 audit fix · mobile top tab bar (md:hidden · sidebar→horizontal scroll) */}
      <div
        className="md:hidden se-row-scroll flex items-center gap-1 overflow-x-auto px-4 py-2"
        style={{
          background: "var(--se-bg-elev)",
          borderBottom: "1px solid var(--se-border)",
        }}
      >
        {(
          [
            { id: "active", label: "當前活躍", icon: Sparkles },
            { id: "summaries", label: `回憶錄 · ${summaries.length}`, icon: BookOpen },
            { id: "lorebook", label: `角色記事 · ${lorebookCount}`, icon: NotebookPen },
            // Session 14 · NPC L3 Inner Voices (Storyteller tier · hidden when empty)
            ...(innerVoicesCount > 0
              ? [{ id: "inner-voices", label: `內心戲 · ${innerVoicesCount}`, icon: Drama }]
              : []),
          ] as const
        ).map((t) => {
          const Ico = t.icon;
          const a = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as Tab)}
              className="flex-none inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs se-cjk"
              style={{
                background: a ? "var(--se-fg)" : "transparent",
                color: a ? "var(--se-bg)" : "var(--se-fg-muted)",
                border: `1px solid ${a ? "var(--se-fg)" : "var(--se-border)"}`,
              }}
            >
              <Ico size={11} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Layout: left nav + main · desktop only · mobile collapses to single col */}
      <div
        className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[260px_1fr]"
      >
        {/* Left nav · hidden on mobile (replaced by top tab bar above) */}
        <nav
          className="hidden md:block p-4"
          style={{
            background: "var(--se-bg-elev)",
            borderRight: "1px solid var(--se-border)",
          }}
        >
          <div
            className="se-mono uppercase mb-2"
            style={{ fontSize: 10, color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}
          >
            記憶層 · 4-LAYER
          </div>
          <div className="flex flex-col gap-1">
            <NavItem
              active={tab === "active"}
              icon={<Sparkles size={14} />}
              label="當前活躍記憶"
              sub={`TURN ${turnCount}`}
              hint="影響緊呢個 turn 嘅記憶"
              onClick={() => setTab("active")}
            />
            <NavItem
              active={tab === "summaries"}
              icon={<BookOpen size={14} />}
              label="回憶錄"
              sub={`${summaries.length} 章`}
              hint="滾動章節摘要 · 每 ~20 turn"
              onClick={() => setTab("summaries")}
            />
            <NavItem
              active={tab === "lorebook"}
              icon={<NotebookPen size={14} />}
              label="角色記事"
              sub={`${lorebookCount} 條`}
              hint="人物 · 地點 · 物品 · 事件 · 概念"
              onClick={() => setTab("lorebook")}
            />
            {/* Session 14 · NPC L3 Inner Voices (Storyteller tier · only show when data exists) */}
            {innerVoicesCount > 0 && (
              <NavItem
                active={tab === "inner-voices"}
                icon={<Drama size={14} />}
                label="NPC 內心戲"
                sub={`${innerVoicesCount} 段 · ${npcNames.length} 個 NPC`}
                hint="Storyteller 獨享 · 每個 NPC 嘅 POV + 心理活動"
                onClick={() => setTab("inner-voices")}
              />
            )}
          </div>
          {/* Recent turns layer · listed but read-only · CLAUDE.md hard rule #7 4 layer */}
          <div
            className="mt-4 p-2.5"
            style={{
              borderTop: "1px solid var(--se-border)",
              opacity: 0.7,
            }}
          >
            <div className="flex items-center gap-2">
              <Clock size={12} color="var(--se-fg-dim)" />
              <span className="text-xs" style={{ color: "var(--se-fg-muted)" }}>
                近 20 turn 全文
              </span>
              <span
                className="se-mono ml-auto"
                style={{ fontSize: 9.5, color: "var(--se-fg-dim)" }}
              >
                自動
              </span>
            </div>
            <div
              className="mt-1 pl-5 text-[10.5px] leading-snug"
              style={{ color: "var(--se-fg-dim)" }}
            >
              敘事 stream 已 show 緊 · 唔需要另一個入口
            </div>
          </div>

          {/* Read-only reinforcement */}
          <div
            className="mt-6 p-3 rounded-lg flex items-start gap-2"
            style={{
              background: "var(--se-surface-2)",
              border: "1px dashed var(--se-border-strong)",
            }}
          >
            <Lock size={11} color="var(--se-fg-dim)" className="mt-0.5 flex-none" />
            <div className="text-[10.5px] se-cjk" style={{ color: "var(--se-fg-muted)", lineHeight: 1.5 }}>
              AI 自動記錄 · 唔可以編輯
              <br />
              （server-only write 經 Migration 0018 enforce）
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="overflow-y-auto">
          {tab === "active" && <TabActive turn={turnCount} />}
          {tab === "summaries" && <TabSummaries summaries={summaries} turnCount={turnCount} />}
          {tab === "lorebook" && <TabLorebook grouped={grouped} types={types} />}
          {tab === "inner-voices" && (
            <TabInnerVoices npcInnerVoices={npcInnerVoices} npcNames={npcNames} />
          )}
        </main>
      </div>

      {/* D5 audit · Hard rule #2 CSAM strip footer (adult content context only) */}
      {showCsam && <CsamStrip variant="footer" />}
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  sub,
  hint,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-2.5 rounded-lg flex flex-col gap-1 text-left transition-colors"
      style={{
        background: active ? "var(--se-surface)" : "transparent",
        border: `1px solid ${active ? "var(--se-border)" : "transparent"}`,
      }}
    >
      <div className="flex items-center gap-2">
        <span style={{ color: active ? "var(--se-accent)" : "var(--se-fg-muted)" }}>{icon}</span>
        <span
          className="text-sm se-cjk"
          style={{
            color: active ? "var(--se-fg)" : "var(--se-fg-2)",
            fontWeight: active ? 500 : 400,
          }}
        >
          {label}
        </span>
        {sub && (
          <span
            className="ml-auto se-mono"
            style={{ fontSize: 10, color: "var(--se-fg-dim)" }}
          >
            {sub}
          </span>
        )}
      </div>
      {hint && (
        <div
          className="pl-5 leading-snug text-[10.5px]"
          style={{ color: "var(--se-fg-dim)" }}
        >
          {hint}
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
//  Tab: 當前活躍記憶 (RAG retrieves for current turn)
//  Empty state per CLAUDE.md hard rule #18: similarity floor means
//  「no match beats noisy match」. Backend doesn't yet expose
//  per-turn retrieved_memory_ids — UI shows explainer until backend
//  adds that field (backlog).
// ─────────────────────────────────────────────────────────────
function TabActive({ turn }: { turn: number }) {
  return (
    <div className="px-8 py-6 max-w-[760px] mx-auto">
      <div
        className="p-4 rounded-lg flex items-start gap-3 mb-6"
        style={{
          background: "var(--se-accent-bg)",
          border: "1px solid var(--se-accent-line)",
        }}
      >
        <Sparkles size={16} color="var(--se-accent)" />
        <div className="flex-1">
          <div
            className="se-mono uppercase mb-1"
            style={{ fontSize: 11, color: "var(--se-accent)", letterSpacing: "0.06em" }}
          >
            LIVE · 當前 TURN {turn}
          </div>
          <p className="text-xs se-cjk m-0" style={{ color: "var(--se-fg-2)", lineHeight: 1.6 }}>
            每 turn AI 都會從你嘅整段歷史搜出最相關嘅段落注入返敘事。下面係 AI 而家「腦海入面浮現緊」嘅嘢。
          </p>
        </div>
      </div>

      <div
        className="px-8 py-12 rounded-xl text-center"
        style={{
          background: "var(--se-surface)",
          border: "1px dashed var(--se-border-strong)",
        }}
      >
        <span
          className="inline-flex items-center justify-center mb-3.5"
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            background: "var(--se-surface-2)",
            color: "var(--se-fg-muted)",
          }}
        >
          <Sparkles size={18} />
        </span>
        <h3
          className="text-base font-medium m-0 se-cjk"
          style={{ color: "var(--se-fg)" }}
        >
          AI 而家用近 20 turn 嘅 context 寫敘事
        </h3>
        <p
          className="text-sm se-cjk mt-2.5 mx-auto max-w-[460px]"
          style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}
        >
          per-turn RAG retrieval log 仲未 wire 落 backend
          <span style={{ color: "var(--se-fg-dim)" }}> (Phase 7+ 加 turns.retrieved_memory_ids[] column)</span>。
          <br />
          我哋設咗相似度 floor — 寧願冇 match 都唔要 noisy match。
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Tab: 回憶錄 (rolling summaries)
// ─────────────────────────────────────────────────────────────
function TabSummaries({
  summaries,
  turnCount,
}: {
  summaries: Summary[];
  turnCount: number;
}) {
  if (summaries.length === 0) {
    const first = 10;
    const pct = Math.min(100, Math.round((turnCount / first) * 100));
    return (
      <div className="px-8 py-12 max-w-[480px] mx-auto text-center">
        <span
          className="inline-flex items-center justify-center mb-4"
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "var(--se-surface)",
            border: "1px solid var(--se-border)",
            color: "var(--se-accent)",
          }}
        >
          <BookOpen size={22} />
        </span>
        <h2 className="text-lg font-semibold mt-3.5 mb-2 se-cjk" style={{ color: "var(--se-fg)" }}>
          AI 仲未開始整理回憶
        </h2>
        <p className="text-sm se-cjk" style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}>
          玩到 turn 10 · AI 會自動寫第一章嘅摘要，記住你做過嘅關鍵決定。之後每 ~20 turn 會再 update。
        </p>
        <div
          className="mt-6 p-3.5 rounded-lg"
          style={{
            background: "var(--se-surface)",
            border: "1px solid var(--se-border)",
          }}
        >
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs se-cjk" style={{ color: "var(--se-fg-muted)" }}>
              距離第一章摘要
            </span>
            <span className="se-mono text-xs" style={{ color: "var(--se-fg)" }}>
              {turnCount} / {first}
            </span>
          </div>
          <div
            style={{
              height: 4,
              background: "var(--se-surface-2)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "var(--se-accent)",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-7 max-w-[760px] mx-auto">
      <p
        className="m-0 mb-6 text-xs se-cjk"
        style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}
      >
        AI 每 ~20 turn 整理一次。摘要會持續影響 AI 嘅判斷 — 即使你玩到 turn 80，第一章嘅嘢佢仍然記得。
      </p>
      <div className="flex flex-col gap-4">
        {summaries.map((s, i) => (
          <article
            key={s.id}
            className="p-5 rounded-xl"
            style={{
              background: "var(--se-surface)",
              border: "1px solid var(--se-border)",
            }}
          >
            <div className="flex items-baseline gap-3 mb-2.5">
              <span
                className="se-mono"
                style={{ fontSize: 11, color: "var(--se-accent)", letterSpacing: "0.06em" }}
              >
                第 {i + 1} 章 · {s.range}
              </span>
              <span
                className="se-mono"
                style={{ fontSize: 10.5, color: "var(--se-fg-dim)" }}
              >
                {new Date(s.writtenAt).toLocaleDateString()}
              </span>
            </div>
            <p
              className="m-0 se-cjk"
              style={{
                fontSize: 14.5,
                lineHeight: 1.85,
                color: "var(--se-fg-2)",
                whiteSpace: "pre-wrap",
              }}
            >
              {s.body}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  Tab: 角色記事 (lorebook)
// ─────────────────────────────────────────────────────────────
function TabLorebook({
  grouped,
  types,
}: {
  grouped: Record<string, LoreRow[]>;
  types: readonly string[];
}) {
  const totalCount = Object.values(grouped).reduce((n, arr) => n + arr.length, 0);

  if (totalCount === 0) {
    return (
      <div className="px-8 py-12 max-w-[480px] mx-auto text-center">
        <span
          className="inline-flex items-center justify-center mb-4"
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "var(--se-surface)",
            border: "1px solid var(--se-border)",
            color: "var(--se-accent)",
          }}
        >
          <NotebookPen size={22} />
        </span>
        <h2 className="text-lg font-semibold mt-3.5 mb-2 se-cjk" style={{ color: "var(--se-fg)" }}>
          AI 仲未識到呢個世界嘅人物
        </h2>
        <p className="text-sm se-cjk" style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}>
          玩多啲 turn · AI 會自動將你遇到嘅人物、地點、物件、事件 extract 出嚟，
          整理成記事，等後尾遇到都唔會「失憶」。
        </p>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 max-w-[980px] mx-auto">
      <div className="flex items-center gap-3.5 mb-4.5">
        <p className="text-xs se-cjk m-0 flex-1" style={{ color: "var(--se-fg-muted)", lineHeight: 1.6 }}>
          AI 自動 extract 嘅 entity · 影響每 turn 嘅敘事。
          <span className="se-mono" style={{ color: "var(--se-accent)" }}>●</span> 標記 = always_on · AI 永遠記得。
        </p>
        <span className="se-mono" style={{ fontSize: 11, color: "var(--se-fg-dim)" }}>
          {totalCount} ENTRIES
        </span>
      </div>
      {types.map((t) => {
        const entries = grouped[t];
        if (!entries || entries.length === 0) return null;
        return (
          <section key={t} className="mb-6">
            <div className="flex items-center gap-2 mb-2.5">
              <h3 className="text-xs font-semibold m-0 se-cjk" style={{ letterSpacing: "-0.005em" }}>
                {ENTITY_LABEL[t]}
              </h3>
              <span
                className="se-mono"
                style={{
                  fontSize: 10,
                  color: "var(--se-fg-dim)",
                  padding: "1px 6px",
                  background: "var(--se-surface-2)",
                  borderRadius: 3,
                }}
              >
                {entries.length}
              </span>
              <div style={{ flex: 1, height: 1, background: "var(--se-border)" }} />
            </div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {entries.map((e) => (
                <LoreCard key={e.id} entry={e} type={t} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LoreCard({ entry, type }: { entry: LoreRow; type: string }) {
  const hue = ENTITY_HUE[type] ?? 240;
  return (
    <div
      className="p-3.5 rounded-lg flex flex-col gap-2"
      style={{
        background: "var(--se-surface)",
        border: "1px solid var(--se-border)",
      }}
    >
      <div className="flex items-center gap-2">
        {entry.always_on && (
          <span
            title="Always on · AI 每 turn 都記得"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--se-accent)",
              boxShadow: "0 0 0 3px var(--se-accent-bg)",
            }}
          />
        )}
        <h3
          className="m-0 text-sm font-medium se-cjk flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ letterSpacing: "-0.005em" }}
        >
          {entry.name}
        </h3>
        <span
          className="se-mono"
          style={{
            fontSize: 9.5,
            padding: "2px 6px",
            borderRadius: 3,
            background: `oklch(0.92 0.05 ${hue} / 0.55)`,
            color: `oklch(0.35 0.13 ${hue})`,
            letterSpacing: "0.04em",
          }}
        >
          {ENTITY_LABEL[type]}
        </span>
      </div>
      <p
        className="m-0 se-cjk text-xs"
        style={{
          color: "var(--se-fg-2)",
          lineHeight: 1.65,
        }}
      >
        {entry.description}
      </p>
      <div className="flex items-center gap-2.5 mt-1 text-[10.5px]" style={{ color: "var(--se-fg-dim)" }}>
        <span className="se-mono">首見 {new Date(entry.created_at).toLocaleDateString()}</span>
        <div className="flex-1" />
        <span
          className="inline-flex items-center gap-1 se-mono"
          title="AI 自動記錄 · 不可編輯 · Migration 0018 server-only write"
          style={{ fontSize: 10 }}
        >
          <Lock size={10} />
          唯讀
        </span>
      </div>
    </div>
  );
}

/**
 * Session 14 · NPC L3 Inner Voices tab (Storyteller-tier feature surface).
 * Per-NPC timeline of inner_thought + intent · grouped by NPC name.
 * CLAUDE.md hard rule #19: backend differentiator must have UI surface ·
 * this tab IS the visible value-add for Storyteller tier.
 */
function TabInnerVoices({
  npcInnerVoices,
  npcNames,
}: {
  npcInnerVoices: Record<string, NpcInnerThought[]>;
  npcNames: string[];
}) {
  const [selectedNpc, setSelectedNpc] = useState<string>(npcNames[0] ?? "");
  const selectedThoughts = selectedNpc ? npcInnerVoices[selectedNpc] ?? [] : [];

  if (npcNames.length === 0) {
    return (
      <div className="px-6 sm:px-8 py-8">
        <div
          className="rounded-lg border p-6 text-center"
          style={{
            background: "var(--se-bg-elev)",
            borderColor: "var(--se-border)",
          }}
        >
          <Drama size={36} style={{ color: "var(--se-fg-dim)", margin: "0 auto" }} />
          <div className="mt-3 text-sm font-semibold se-cjk">未有 NPC 內心戲記錄</div>
          <div
            className="mt-2 text-xs leading-relaxed se-cjk"
            style={{ color: "var(--se-fg-dim)" }}
          >
            喺 Play 頁啟動「NPC 內心戲」(Storyteller 獨享) ·
            <br />
            之後每個 turn 嘅 NPC POV 會 record 喺呢度。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 sm:px-8 py-6">
      {/* NPC selector chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {npcNames.map((name) => {
          const active = name === selectedNpc;
          const count = npcInnerVoices[name]?.length ?? 0;
          return (
            <button
              key={name}
              onClick={() => setSelectedNpc(name)}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs se-cjk transition-colors"
              style={{
                background: active ? "var(--se-fg)" : "transparent",
                color: active ? "var(--se-bg)" : "var(--se-fg-muted)",
                border: `1px solid ${active ? "var(--se-fg)" : "var(--se-border)"}`,
              }}
            >
              <Drama size={11} />
              {name}
              <span
                className="se-mono"
                style={{
                  fontSize: 10,
                  opacity: 0.7,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline · most-recent first */}
      <div className="flex flex-col gap-3">
        {selectedThoughts.length === 0 ? (
          <div className="text-xs se-cjk" style={{ color: "var(--se-fg-dim)" }}>
            未有 inner thought 記錄。
          </div>
        ) : (
          selectedThoughts.map((t) => (
            <div
              key={t.id}
              className="rounded-lg border p-3.5"
              style={{
                background: "var(--se-bg-elev)",
                borderColor: "var(--se-border)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="se-mono"
                  style={{
                    fontSize: 10,
                    color: "var(--se-fg-dim)",
                    letterSpacing: "0.05em",
                  }}
                >
                  TURN {t.turnIndex}
                </span>
                <span
                  className="text-[10px] inline-flex items-center gap-1"
                  style={{ color: "var(--se-fg-dim)" }}
                >
                  <Lock size={9} /> 內部 POV
                </span>
              </div>
              <div className="se-cjk text-sm leading-relaxed mb-2">
                <span
                  className="se-mono uppercase text-[9px] mr-1.5"
                  style={{ color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}
                >
                  心底
                </span>
                {t.innerThought}
              </div>
              <div
                className="se-cjk text-xs leading-relaxed"
                style={{ color: "var(--se-fg-muted)" }}
              >
                <span
                  className="se-mono uppercase text-[9px] mr-1.5"
                  style={{ color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}
                >
                  意圖
                </span>
                {t.intent}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
