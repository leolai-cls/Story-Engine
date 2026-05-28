"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Cover } from "./Cover";
import { Sparkles, Brain, Users } from "lucide-react";

/**
 * A2 audit fix · Visitor landing screen — anon visitors see cinematic
 * 3-pillar pitch + cover collage instead of falling into authed library.
 *
 * Rendered above Library hero when !user. Uses 3-pillar messaging
 * (memory · NPC integrity · cover-led storytelling) for first-impression
 * differentiation vs AI Dungeon / Character.AI / NovelAI.
 *
 * Wave 2 i18n migration (2026-05-27): all copy localized via visitorLanding.*.
 */
export function VisitorLanding({ locale }: { locale: string }) {
  const t = useTranslations("visitorLanding");
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
            {t("eyebrow")}
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
            {t("headlineLine1")}
            <br />
            {t("headlineLine2")}
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
            {t("subtitle")}
          </p>
          {/* 3 pillars */}
          <div className="grid grid-cols-3 gap-5 mt-9">
            <Pillar
              icon={<Brain size={16} />}
              title={t("pillars.memory.title")}
              body={t("pillars.memory.body")}
            />
            <Pillar
              icon={<Users size={16} />}
              title={t("pillars.npcs.title")}
              body={t("pillars.npcs.body")}
            />
            <Pillar
              icon={<Sparkles size={16} />}
              title={t("pillars.adaptive.title")}
              body={t("pillars.adaptive.body")}
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
              {t("ctaGuest")}
            </Link>
            <Link
              href={`/${locale}/login`}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md text-sm font-medium se-cjk"
              style={{
                border: "1px solid var(--se-border-strong)",
                color: "var(--se-fg-2)",
              }}
            >
              {t("ctaEmail")}
            </Link>
            <span
              className="text-xs ml-1 se-cjk"
              style={{ color: "var(--se-fg-dim)" }}
            >
              {t("noCardHint")}
            </span>
          </div>
        </div>

        {/* Right: 3-tile cover collage · staggered offsets per designer's mock */}
        <div className="hidden md:block relative" style={{ height: 480 }}>
          {/* Tile 1 · top-left larger · early */}
          <div
            className="absolute"
            style={{
              left: 0,
              top: 0,
              width: 200,
              height: 267,
            }}
          >
            <Cover storyId="visitor-collage-1" hue={240} ratio="3 / 4" size="lg" noLabel />
          </div>
          {/* Tile 2 · top-right offset down */}
          <div
            className="absolute"
            style={{
              right: 0,
              top: 48,
              width: 200,
              height: 267,
            }}
          >
            <Cover storyId="visitor-collage-2" hue={320} ratio="3 / 4" size="lg" noLabel />
          </div>
          {/* Tile 3 · bottom-center · overlapping */}
          <div
            className="absolute"
            style={{
              left: 100,
              bottom: 0,
              width: 220,
              height: 293,
            }}
          >
            <Cover storyId="visitor-collage-3" hue={285} ratio="3 / 4" size="lg" noLabel />
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
