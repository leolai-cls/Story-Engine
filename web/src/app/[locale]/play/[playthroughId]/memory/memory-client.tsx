"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
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

/**
 * Wave 2 i18n migration (2026-05-27): @deprecated · resolve via
 * `useTranslations("memory.entryKind")` at render site instead.
 */
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
  subscriptionTier = "free",
  npcL3Enabled = false,
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
  /** Session 16 P-09: tier gating for empty-state copy on Inner Voices tab. */
  subscriptionTier?: "free" | "adventurer" | "storyteller" | "legend";
  /** Session 16 P-09: whether L3 toggle is ON for this playthrough. */
  npcL3Enabled?: boolean;
}) {
  // Wave 2 i18n migration (2026-05-27): full UI localized via memory.* catalog.
  const t = useTranslations("memory");
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
          {t("backToPlay")}
        </Link>
        <div style={{ width: 1, height: 18, background: "var(--se-border)" }} />
        <div>
          <h1
            className="m-0 text-sm font-semibold se-cjk"
            style={{ color: "var(--se-fg)" }}
          >
            {t("headerTitle", { protagonist })}
          </h1>
          <div
            className="se-mono mt-0.5"
            style={{ fontSize: 10.5, color: "var(--se-fg-dim)", letterSpacing: "0.04em" }}
          >
            {showCsam
              ? t("headerSubtitleAdult", { storyTitle: storyTitle.toUpperCase(), turn: turnCount })
              : t("headerSubtitle", { storyTitle: storyTitle.toUpperCase(), turn: turnCount })}
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
          {t("continuePlay")}
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
            { id: "active", label: t("tabs.active"), icon: Sparkles },
            { id: "summaries", label: t("tabs.memoir", { count: summaries.length }), icon: BookOpen },
            { id: "lorebook", label: t("tabs.characters", { count: lorebookCount }), icon: NotebookPen },
            // Session 14 · NPC L3 Inner Voices (Storyteller-tier marquee feature)
            // Session 16 P-09: ALWAYS render tab so Pro upgrade-day user sees what
            // they bought + Free/Standard user sees what to upgrade for.
            { id: "inner-voices", label: t("tabs.innerVoices", { count: innerVoicesCount }), icon: Drama },
          ] as const
        ).map((entry) => {
          const Ico = entry.icon;
          const a = tab === entry.id;
          return (
            <button
              key={entry.id}
              onClick={() => setTab(entry.id as Tab)}
              className="flex-none inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs se-cjk"
              style={{
                background: a ? "var(--se-fg)" : "transparent",
                color: a ? "var(--se-bg)" : "var(--se-fg-muted)",
                border: `1px solid ${a ? "var(--se-fg)" : "var(--se-border)"}`,
              }}
            >
              <Ico size={11} />
              {entry.label}
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
            {t("nav.layerLabel")}
          </div>
          <div className="flex flex-col gap-1">
            <NavItem
              active={tab === "active"}
              icon={<Sparkles size={14} />}
              label={t("nav.activeLabel")}
              sub={`TURN ${turnCount}`}
              hint={t("nav.activeHint")}
              onClick={() => setTab("active")}
            />
            <NavItem
              active={tab === "summaries"}
              icon={<BookOpen size={14} />}
              label={t("nav.memoirLabel")}
              sub={t("nav.memoirSub", { count: summaries.length })}
              hint={t("nav.memoirHint")}
              onClick={() => setTab("summaries")}
            />
            <NavItem
              active={tab === "lorebook"}
              icon={<NotebookPen size={14} />}
              label={t("nav.charactersLabel")}
              sub={t("nav.charactersSub", { count: lorebookCount })}
              hint={t("nav.charactersHint")}
              onClick={() => setTab("lorebook")}
            />
            {/* Session 14 · NPC L3 Inner Voices (Storyteller-tier marquee feature)
                Session 16 P-09: ALWAYS render · empty state explainer in TabInnerVoices. */}
            <NavItem
              active={tab === "inner-voices"}
              icon={<Drama size={14} />}
              label={t("nav.innerVoicesLabel")}
              sub={
                innerVoicesCount > 0
                  ? t("nav.innerVoicesSub", { count: innerVoicesCount, npcs: npcNames.length })
                  : t("nav.innerVoicesSubEmpty")
              }
              hint={t("nav.innerVoicesHint")}
              onClick={() => setTab("inner-voices")}
            />
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
                {t("nav.recentLabel")}
              </span>
              <span
                className="se-mono ml-auto"
                style={{ fontSize: 9.5, color: "var(--se-fg-dim)" }}
              >
                {t("nav.recentBadge")}
              </span>
            </div>
            <div
              className="mt-1 pl-5 text-[10.5px] leading-snug"
              style={{ color: "var(--se-fg-dim)" }}
            >
              {t("nav.recentHint")}
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
              {t("nav.readonlyTitle")}
              <br />
              {t("nav.readonlyBody")}
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="overflow-y-auto">
          {tab === "active" && <TabActive turn={turnCount} />}
          {tab === "summaries" && <TabSummaries summaries={summaries} turnCount={turnCount} locale={locale} />}
          {tab === "lorebook" && <TabLorebook grouped={grouped} types={types} locale={locale} />}
          {tab === "inner-voices" && (
            <TabInnerVoices
              npcInnerVoices={npcInnerVoices}
              npcNames={npcNames}
              subscriptionTier={subscriptionTier}
              npcL3Enabled={npcL3Enabled}
            />
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
  const tAct = useTranslations("memory.active");
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
            {tAct("currentTurnLabel", { turn })}
          </div>
          <p className="text-xs se-cjk m-0" style={{ color: "var(--se-fg-2)", lineHeight: 1.6 }}>
            {tAct("explainer")}
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
          {tAct("fallbackTitle")}
        </h3>
        <p
          className="text-sm se-cjk mt-2.5 mx-auto max-w-[460px]"
          style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}
        >
          {tAct("fallbackBody")}
          <span style={{ color: "var(--se-fg-dim)" }}> {tAct("fallbackBodyAside")}</span>
          <br />
          {tAct("fallbackNoMatch")}
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
  locale,
}: {
  summaries: Summary[];
  turnCount: number;
  locale: string;
}) {
  const tMem = useTranslations("memory.memoir");
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
          {tMem("emptyTitle")}
        </h2>
        <p className="text-sm se-cjk" style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}>
          {tMem("emptyBody")}
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
              {tMem("untilFirst")}
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
        {tMem("header")}
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
                {tMem("chapterTitle", { n: i + 1, range: s.range })}
              </span>
              <span
                className="se-mono"
                style={{ fontSize: 10.5, color: "var(--se-fg-dim)" }}
              >
                {new Date(s.writtenAt).toLocaleDateString(locale)}
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
  locale,
}: {
  grouped: Record<string, LoreRow[]>;
  types: readonly string[];
  locale: string;
}) {
  // Wave 2 i18n migration (2026-05-27): entity type labels + empty state localized.
  const tChars = useTranslations("memory.characters");
  const tEntry = useTranslations("memory.entryKind");
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
          {tChars("emptyTitle")}
        </h2>
        <p className="text-sm se-cjk" style={{ color: "var(--se-fg-muted)", lineHeight: 1.65 }}>
          {tChars("emptyBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 max-w-[980px] mx-auto">
      <div className="flex items-center gap-3.5 mb-4.5">
        <p className="text-xs se-cjk m-0 flex-1" style={{ color: "var(--se-fg-muted)", lineHeight: 1.6 }}>
          {tChars("header")}{" "}
          <span className="se-mono" style={{ color: "var(--se-accent)" }}>●</span>{" "}
          {tChars("alwaysOnLegend")}
        </p>
        <span className="se-mono" style={{ fontSize: 11, color: "var(--se-fg-dim)" }}>
          {totalCount} {tChars("entriesSuffix")}
        </span>
      </div>
      {types.map((typeKey) => {
        const entries = grouped[typeKey];
        if (!entries || entries.length === 0) return null;
        return (
          <section key={typeKey} className="mb-6">
            <div className="flex items-center gap-2 mb-2.5">
              <h3 className="text-xs font-semibold m-0 se-cjk" style={{ letterSpacing: "-0.005em" }}>
                {tEntry(typeKey)}
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
                <LoreCard key={e.id} entry={e} type={typeKey} locale={locale} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LoreCard({ entry, type, locale }: { entry: LoreRow; type: string; locale: string }) {
  // Wave 2 i18n migration (2026-05-27): entity-kind label + "always-on" tooltip + first-seen label localized.
  const tEntry = useTranslations("memory.entryKind");
  const tCharCard = useTranslations("memory.characters");
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
            title={tCharCard("alwaysOn")}
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
          {tEntry(type as "character" | "place" | "item" | "event" | "concept")}
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
        <span className="se-mono">{tCharCard("firstSeen")} {new Date(entry.created_at).toLocaleDateString(locale)}</span>
        <div className="flex-1" />
        <span
          className="inline-flex items-center gap-1 se-mono"
          title={tCharCard("readonlyTooltip")}
          style={{ fontSize: 10 }}
        >
          <Lock size={10} />
          {tCharCard("readonlyBadge")}
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
  subscriptionTier,
  npcL3Enabled,
}: {
  npcInnerVoices: Record<string, NpcInnerThought[]>;
  npcNames: string[];
  subscriptionTier: "free" | "adventurer" | "storyteller" | "legend";
  npcL3Enabled: boolean;
}) {
  const tIV = useTranslations("memory.innerVoices");
  const [selectedNpc, setSelectedNpc] = useState<string>(npcNames[0] ?? "");
  const selectedThoughts = selectedNpc ? npcInnerVoices[selectedNpc] ?? [] : [];

  if (npcNames.length === 0) {
    // Session 16 P-09: differentiate empty-state copy by tier + L3 toggle state.
    //   Pro + L3 ON  → "First L3 turn upcoming · this tab will populate"
    //   Pro + L3 OFF → "Enable NPC Inner Voices on the play page"
    //   Free/Standard → "Upgrade to Pro to unlock NPC Inner Voices"
    const tierEligible = subscriptionTier === "storyteller" || subscriptionTier === "legend";
    const emptyTitleKey = !tierEligible
      ? "emptyTitleUpgrade"
      : npcL3Enabled
        ? "emptyTitleReady"
        : "emptyTitleEnable";
    const emptyBodyKey = !tierEligible
      ? "emptyBodyUpgrade"
      : npcL3Enabled
        ? "emptyBodyReady"
        : "emptyBodyEnable";
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
          <div className="mt-3 text-sm font-semibold se-cjk">{tIV(emptyTitleKey)}</div>
          <div
            className="mt-2 text-xs leading-relaxed se-cjk"
            style={{ color: "var(--se-fg-dim)" }}
          >
            {tIV(emptyBodyKey)}
            <br />
            {tIV("emptyHint")}
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
            {tIV("noThoughtsForNpc")}
          </div>
        ) : (
          selectedThoughts.map((thought) => (
            <div
              key={thought.id}
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
                  TURN {thought.turnIndex}
                </span>
                <span
                  className="text-[10px] inline-flex items-center gap-1"
                  style={{ color: "var(--se-fg-dim)" }}
                >
                  <Lock size={9} /> {tIV("internalPov")}
                </span>
              </div>
              <div className="se-cjk text-sm leading-relaxed mb-2">
                <span
                  className="se-mono uppercase text-[9px] mr-1.5"
                  style={{ color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}
                >
                  {tIV("innerThought")}
                </span>
                {thought.innerThought}
              </div>
              <div
                className="se-cjk text-xs leading-relaxed"
                style={{ color: "var(--se-fg-muted)" }}
              >
                <span
                  className="se-mono uppercase text-[9px] mr-1.5"
                  style={{ color: "var(--se-fg-dim)", letterSpacing: "0.08em" }}
                >
                  {tIV("intent")}
                </span>
                {thought.intent}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
