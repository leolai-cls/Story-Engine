import Link from "next/link";
import { Cover } from "./Cover";
import { Sparkles, Brain, Users } from "lucide-react";

/**
 * A2 audit fix · Visitor landing screen — anon visitors see cinematic
 * 3-pillar pitch + cover collage instead of falling into authed library.
 *
 * Rendered above Library hero when !user. Uses 3-pillar messaging
 * (memory · NPC integrity · cover-led storytelling) for first-impression
 * differentiation vs AI Dungeon / Character.AI / NovelAI.
 */
export function VisitorLanding({ locale }: { locale: string }) {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        borderBottom: "1px solid var(--se-border)",
        background: "var(--se-bg)",
      }}
    >
      <div
        className="mx-auto px-6 sm:px-14 py-16"
        style={{
          maxWidth: 1280,
          display: "grid",
          gridTemplateColumns: "1fr 460px",
          gap: 56,
          alignItems: "center",
        }}
      >
        {/* Left: pitch */}
        <div>
          <span
            className="se-mono uppercase"
            style={{
              fontSize: 11,
              color: "var(--se-accent)",
              letterSpacing: "0.18em",
            }}
          >
            STORY ENGINE · BETA
          </span>
          <h1
            className="se-cjk m-0 mt-4"
            style={{
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              color: "var(--se-fg)",
              textWrap: "balance",
            }}
          >
            每一個故事
            <br />
            都記住你做過嘅每一個決定
          </h1>
          <p
            className="mt-6 se-cjk"
            style={{
              fontSize: 16,
              lineHeight: 1.65,
              color: "var(--se-fg-muted)",
              maxWidth: 540,
              textWrap: "pretty",
            }}
          >
            中文圈嘅互動式 RPG 平台 · AI 即時生成劇情 · 角色有自己嘅紅線同好感度 ·
            你做嘅每個選擇永久記入長期記憶。
          </p>
          {/* 3 pillars */}
          <div className="grid grid-cols-3 gap-5 mt-9">
            <Pillar
              icon={<Brain size={16} />}
              title="4 層長期記憶"
              body="近 20 turn · 滾動摘要 · RAG 向量 · auto-lorebook · AI 真係記得"
            />
            <Pillar
              icon={<Users size={16} />}
              title="NPC 有紅線"
              body="角色唔係 Yes-man · 4-axis disposition · 唔可以單靠 prompt 推翻"
            />
            <Pillar
              icon={<Sparkles size={16} />}
              title="自適應介面"
              body="每個故事 AI 生成專屬 state schema · 戀愛係好感度環 · D&D 係 HP/MP 條"
            />
          </div>
          <div className="flex gap-2.5 mt-9 flex-wrap items-center">
            <Link
              href={`/${locale}/login`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-sm font-semibold se-cjk"
              style={{
                background: "var(--se-fg)",
                color: "var(--se-bg)",
              }}
            >
              <Sparkles size={14} />
              免費試玩 · 一鍵 Guest
            </Link>
            <Link
              href={`/${locale}/login`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-sm font-medium se-cjk"
              style={{
                border: "1px solid var(--se-border-strong)",
                color: "var(--se-fg-2)",
              }}
            >
              用 Email 登入
            </Link>
            <span
              className="text-xs ml-1 se-cjk"
              style={{ color: "var(--se-fg-dim)" }}
            >
              無需信用卡 · 即時開始
            </span>
          </div>
        </div>

        {/* Right: 3-tile cover collage */}
        <div
          className="grid grid-cols-2 gap-3"
          style={{
            gridTemplateRows: "1fr 1fr",
          }}
        >
          <div style={{ aspectRatio: "3 / 4" }}>
            <Cover storyId="visitor-collage-1" hue={240} ratio="auto" size="lg" noLabel />
          </div>
          <div style={{ aspectRatio: "3 / 4", marginTop: 32 }}>
            <Cover storyId="visitor-collage-2" hue={320} ratio="auto" size="lg" noLabel />
          </div>
          <div style={{ aspectRatio: "3 / 4", gridColumn: "span 2", marginTop: -56 }}>
            <Cover storyId="visitor-collage-3" hue={285} ratio="auto" size="lg" noLabel />
          </div>
        </div>
      </div>
    </section>
  );
}

function Pillar({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="inline-flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "var(--se-accent-bg)",
          color: "var(--se-accent)",
        }}
      >
        {icon}
      </span>
      <div
        className="text-sm font-semibold se-cjk"
        style={{ color: "var(--se-fg)" }}
      >
        {title}
      </div>
      <p
        className="m-0 text-xs se-cjk"
        style={{
          color: "var(--se-fg-muted)",
          lineHeight: 1.55,
        }}
      >
        {body}
      </p>
    </div>
  );
}
