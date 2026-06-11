"use client";

/**
 * Marketing landing · 2026-06-11 taste-skill redesign (founder-approved mockup:
 * repo-root website-redesign-2026-06-11.html · rev 2).
 *
 * Dark cinematic single page · 9 sections (IA + anchor ids preserved from the
 * previous version): hero / portal / how / memory / agents / adaptive /
 * bilingual / adult / cta.
 *
 * What changed vs the previous landing (audit-driven):
 *   - Signup CTA unified to ONE label per locale (nav + hero + final CTA).
 *   - Eyebrow micro-labels cut from 9 → 3 (how / memory / adult).
 *   - Adult section copy fixed: 18+ SELF-ATTEST (the old copy advertised
 *     Stripe-Identity KYC, which was cancelled · ADR-023).
 *   - NPC inner voices copy fixed: paid plans (Standard 1 / Pro 3), not
 *     Pro-exclusive (auto-on for paid tiers since 2026-06-10).
 *   - Scroll choreography rebuilt on GSAP ScrollTrigger (pin + scrub ·
 *     canonical start:"top top") instead of window scroll listeners.
 *     Signature set piece kept: folder → cursor click → poster burst.
 *   - Mobile + prefers-reduced-motion degrade to a static poster grid.
 *
 * Routing: kieio.com/ renders this · app.kieio.com/ never reaches it.
 */

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MARKETING_COPY, LOCALE_SWITCHER, type MarketingLang } from "./copy";
import { appUrl } from "@/lib/urls";

/** Story-cover showcase tiles. Stylised gradient art standing in for the real
 *  AI-generated covers the product creates (swap to real cover images when a
 *  curated set exists). zh/en titles render per-locale. */
const POSTERS = [
  { art: 1, glyph: "俠", zh: "長安十二時辰", en: "Chang'an, Twelve Hours", tag: "WUXIA" },
  { art: 2, glyph: "夜", zh: "深夜咖啡店", en: "Midnight Coffee Shop", tag: "SLICE OF LIFE" },
  { art: 3, glyph: "謎", zh: "京都最後一盞燈", en: "Last Light, Kyoto", tag: "MYSTERY" },
  { art: 4, glyph: "末", zh: "末世香港", en: "Hong Kong, After", tag: "POST-APOC" },
  { art: 5, glyph: "月", zh: "月球殖民 2089", en: "Moon Colony 2089", tag: "SCI-FI" },
  { art: 6, glyph: "戀", zh: "校園戀曲", en: "Campus Notes", tag: "ROMANCE" },
  { art: 7, glyph: "滬", zh: "1925 上海", en: "Shanghai, 1925", tag: "PERIOD" },
  { art: 8, glyph: "龍", zh: "Cyberpunk 九龍", en: "Cyberpunk Kowloon", tag: "CYBERPUNK" },
  { art: 9, glyph: "鬼", zh: "七月半", en: "Mid-Seventh Moon", tag: "HORROR" },
  { art: 10, glyph: "光", zh: "極光下嘅信", en: "A Letter Under Aurora", tag: "ADVENTURE" },
] as const;

export function MarketingLanding({
  lang,
  locale,
  authedUser,
}: {
  lang: MarketingLang;
  locale: string;
  /** If the user is already logged in on .kieio.com cookie scope, the nav CTA
   *  becomes「打開應用」→ app library instead of the signup label. */
  authedUser?: { displayName: string | null } | null;
}) {
  const nav = MARKETING_COPY.nav[lang];
  const signup = MARKETING_COPY.signup[lang];
  const hero = MARKETING_COPY.hero[lang];
  const stream = MARKETING_COPY.stream[lang];
  const how = MARKETING_COPY.how[lang];
  const memory = MARKETING_COPY.memory[lang];
  const agents = MARKETING_COPY.agents[lang];
  const adaptive = MARKETING_COPY.adaptive[lang];
  const bilingual = MARKETING_COPY.bilingual[lang];
  const adult = MARKETING_COPY.adult[lang];
  const cta = MARKETING_COPY.cta[lang];
  const APP_LOGIN = appUrl(`/${locale}/login`);
  const APP_LIBRARY = appUrl(`/${locale}/library`);

  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<SVGSVGElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Nav blur + section reveals · IntersectionObserver only (no scroll listeners).
  useEffect(() => {
    const navEl = navRef.current;
    const sentinel = sentinelRef.current;
    const root = rootRef.current;
    if (!navEl || !sentinel || !root) return;

    const navIO = new IntersectionObserver(([e]) =>
      navEl.classList.toggle("scrolled", !e.isIntersecting),
    );
    navIO.observe(sentinel);

    const revealIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            revealIO.unobserve(e.target);
          }
        });
      },
      { threshold: 0.18 },
    );
    root.querySelectorAll(".rv").forEach((el) => revealIO.observe(el));

    return () => {
      navIO.disconnect();
      revealIO.disconnect();
    };
  }, []);

  // STORIES scroll choreography · folder → cursor click → poster burst.
  // Pinned + scrubbed (canonical: start "top top" · pin · scrub). Desktop +
  // motion-OK only; mobile / reduced-motion keep the static grid (folder hidden
  // via CSS). All geometry uses LAYOUT offsets (offsetLeft/Top ignore CSS
  // transforms) so invalidateOnRefresh can re-measure mid-animation safely, and
  // the poster destination is an EXPLICIT fromTo target (x:0 = natural grid
  // spot) so no refresh can corrupt where the cards land.
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add(
      { desk: "(min-width: 860px)", motionOK: "(prefers-reduced-motion: no-preference)" },
      (ctx) => {
        const c = ctx.conditions as { desk: boolean; motionOK: boolean };
        if (!c.desk || !c.motionOK) return;
        const stage = stageRef.current;
        const folder = folderRef.current;
        const ring = ringRef.current;
        const cur = cursorRef.current;
        const grid = gridRef.current;
        if (!stage || !folder || !ring || !cur || !grid) return;
        const posters = Array.from(grid.querySelectorAll<HTMLElement>(".poster"));
        if (posters.length === 0) return;

        // Folder visual center = (offsetLeft, offsetTop): left:50%/top:56% put
        // the layout box origin there and translate(-50%,-50%) centers on it.
        const folderC = () => ({ x: folder.offsetLeft, y: folder.offsetTop });
        const posterC = (p: HTMLElement) => ({
          x: p.offsetLeft + p.offsetWidth / 2,
          y: p.offsetTop + p.offsetHeight / 2,
        });
        const rng = (s: number) => {
          const x = Math.sin(s * 999) * 10000;
          return x - Math.floor(x);
        };

        // Folder is the scene anchor: visible from the very first pinned frame.
        gsap.set(folder, { opacity: 1, scale: 1 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: "+=1800",
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });

        tl.fromTo(
          cur,
          { x: () => folderC().x + 320, y: () => folderC().y + 210, opacity: 0 },
          { x: () => folderC().x - 4, y: () => folderC().y - 4, opacity: 1, duration: 0.16, ease: "power2.inOut" },
          0,
        )
          .to(cur, { scale: 0.82, duration: 0.02, yoyo: true, repeat: 1, transformOrigin: "top left" }, 0.17)
          .to(folder, { scale: 0.94, duration: 0.02 }, 0.17)
          .to(folder, { scale: 1.06, duration: 0.03 }, 0.19)
          .fromTo(ring, { opacity: 0.9, scale: 0.4 }, { opacity: 0, scale: 1.7, duration: 0.1, ease: "power1.out" }, 0.18)
          .to(cur, { opacity: 0, duration: 0.05 }, 0.22)
          .fromTo(
            posters,
            {
              x: (i: number) => folderC().x - posterC(posters[i]).x,
              y: (i: number) => folderC().y - posterC(posters[i]).y,
              scale: 0.12,
              opacity: 0,
              rotation: (i: number) => (rng(i * 7) - 0.5) * 50,
            },
            { x: 0, y: 0, scale: 1, opacity: 1, rotation: 0, duration: 0.46, ease: "power3.out", stagger: 0.025 },
            0.22,
          )
          .to(folder, { opacity: 0, scale: 0.7, duration: 0.1 }, 0.3)
          .to({}, { duration: 0.22 });
      },
    );
    return () => mm.revert();
  }, []);

  return (
    <div className="kieio-marketing" ref={rootRef}>
      <style>{MARKETING_CSS}</style>
      <div className="nav-sentinel" ref={sentinelRef} aria-hidden="true" />

      {/* ── NAV ── */}
      <nav className="knav" ref={navRef}>
        <div className="knav-in">
          <a href="#hero" className="brand">
            <span className="k-mark">(o)</span>
            <span className="k-word">KIEIO</span>
          </a>
          <div className="knav-links">
            <a href="#how">{nav.how}</a>
            <a href="#memory">{nav.memory}</a>
            <a href={`/${locale}/pricing`}>{nav.pricing}</a>
            <span className="locale-switch">
              {LOCALE_SWITCHER.map((l, i) => (
                <span key={l.locale}>
                  {i > 0 && <span className="sep">·</span>}
                  <a
                    href={`/${l.locale}`}
                    className={l.lang === lang ? "locale-active" : ""}
                    aria-current={l.lang === lang ? "page" : undefined}
                  >
                    {l.label}
                  </a>
                </span>
              ))}
            </span>
          </div>
          {authedUser ? (
            <a href={APP_LIBRARY} className="knav-cta" title={authedUser.displayName ?? undefined}>
              {lang === "en"
                ? `Open app${authedUser.displayName ? ` · ${authedUser.displayName}` : ""} →`
                : lang === "zhHans"
                  ? `打开应用${authedUser.displayName ? ` · ${authedUser.displayName}` : ""} →`
                  : `打開應用${authedUser.displayName ? ` · ${authedUser.displayName}` : ""} →`}
            </a>
          ) : (
            <a href={APP_LOGIN} className="knav-cta">
              {signup}
            </a>
          )}
        </div>
      </nav>

      {/* ── HERO · asymmetric split + live product preview ── */}
      <header className="hero" id="hero">
        <div className="wrap hero-grid">
          <div>
            <h1>
              {hero.titleLine1}
              <br />
              {hero.titleLine2Pre}
              <span className="hi">{hero.titleAccent}</span>
              {hero.titleSuffix}
            </h1>
            <p className="sub">{hero.sub}</p>
            <div className="cta-row">
              <a className="btn-p" href={APP_LOGIN}>
                {signup}
              </a>
              <a className="btn-s" href="#how">
                {hero.ctaSecondary}
              </a>
            </div>
          </div>
          <div className="chat" aria-label="Product preview">
            <div className="chat-bar">
              <span className="t">{hero.previewTitle}</span>
              <span className="live">LIVE</span>
            </div>
            <div className="chat-body">
              <div className="msg">
                <div className="who">{hero.chat.m1Who}</div>
                <div className="bub">
                  {hero.chat.m1Text}
                  <b className="em">{hero.chat.m1Em}</b>
                  {hero.chat.m1Post}
                </div>
              </div>
              <div className="msg you">
                <div className="who">{hero.chat.m2Who}</div>
                <div className="bub">{hero.chat.m2Text}</div>
              </div>
              <div className="msg">
                <div className="who">{hero.chat.m3Who}</div>
                <div className="bub">{hero.chat.m3Text}</div>
                <div className="mem">{hero.chat.m3Mem}</div>
              </div>
              <div className="msg">
                <div className="who">{hero.chat.m4Who}</div>
                <div className="bub">{hero.chat.m4Text}</div>
              </div>
            </div>
            <div className="chat-input">
              {hero.previewInputHint}
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── STORIES · scroll-pinned folder → poster burst ── */}
      <section className="stories" id="portal">
        <div className="stage" ref={stageRef}>
          <div className="wrap stage-wrap">
            <div className="head rv">
              <h2>
                {stream.titlePre}
                <span className="hi">{stream.titleAccent}</span>
              </h2>
              <p className="lede">{stream.lede}</p>
            </div>
            <div className="pgrid" ref={gridRef}>
              {POSTERS.map((p) => (
                <div className={`poster a${p.art}`} key={p.art}>
                  <span className="glyph">{p.glyph}</span>
                  <div className="meta">
                    <div className="zh">{lang === "en" ? p.en : p.zh}</div>
                    <div className="en">{p.tag}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="folder" ref={folderRef}>
            <div className="ring" ref={ringRef} />
            <div className="body">
              <div className="lab">{lang === "en" ? "Stories" : "故事"}</div>
            </div>
          </div>
          <svg className="cursorx" ref={cursorRef} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 3l14 8.5-6.2 1.6L9.5 19 5 3z" fill="#fff" stroke="rgba(0,0,0,.45)" strokeWidth="1.2" />
          </svg>
        </div>
      </section>

      {/* ── HOW · three acts on a line ── */}
      <section className="how" id="how">
        <div className="wrap">
          <div className="head rv">
            <div className="eyebrow">{how.eyebrow}</div>
            <h2>{how.title}</h2>
            <p className="lede">{how.lede}</p>
          </div>
          <div className="acts">
            <div className="act rv">
              <div className="num">1</div>
              <div>
                <h3>{how.act1Title}</h3>
                <p>{how.act1Body}</p>
              </div>
              <div className="panel">
                <div className="tag">{how.act1Tag}</div>
                {how.act1Panel}
              </div>
            </div>
            <div className="act rv">
              <div className="num">2</div>
              <div>
                <h3>{how.act2Title}</h3>
                <p>{how.act2Body}</p>
              </div>
              <div className="panel">
                <div className="tag">{how.act2Tag}</div>
                {how.act2Panel}
              </div>
            </div>
            <div className="act rv">
              <div className="num">3</div>
              <div>
                <h3>{how.act3Title}</h3>
                <p>{how.act3Body}</p>
              </div>
              <div className="panel">
                <div className="tag">{how.act3Tag}</div>
                <div className="choice">{how.act3Choice1}</div>
                <div className="choice">{how.act3Choice2}</div>
                <div className="choice">{how.act3Choice3}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MEMORY · bento ── */}
      <section className="memory" id="memory">
        <div className="wrap">
          <div className="head rv">
            <div className="eyebrow">{memory.eyebrow}</div>
            <h2>
              {memory.titlePre}
              <span className="hi">{memory.titleAccent}</span>
              {memory.titleSuffix}
            </h2>
            <p className="lede">{memory.lede}</p>
          </div>
          <div className="bento">
            <div className="cell big rv">
              <span className="k">{memory.bigK}</span>
              <h3>{memory.bigTitle}</h3>
              <p>{memory.bigBody}</p>
              <div className="frag">
                {memory.bigFrag}
                <span className="m">{memory.bigFragMeta}</span>
              </div>
            </div>
            <div className="cell rv">
              <span className="k">{memory.c1K}</span>
              <h3>{memory.c1Title}</h3>
              <p>{memory.c1Body}</p>
            </div>
            <div className="cell rv">
              <span className="k">{memory.c2K}</span>
              <h3>{memory.c2Title}</h3>
              <p>{memory.c2Body}</p>
            </div>
            <div className="cell rv">
              <span className="k">{memory.c3K}</span>
              <h3>{memory.c3Title}</h3>
              <p>{memory.c3Body}</p>
            </div>
            <div className="cell stat-cell rv">
              <div>
                <div className="big-n">{memory.statNum}</div>
                <div className="big-l">{memory.statLabel}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── AGENTS · NPC inner voices ── */}
      <section className="agents" id="agents">
        <div className="wrap">
          <div className="head rv">
            <h2>
              {agents.titlePre}
              <span className="hi">{agents.titleAccent}</span>
              {agents.titleSuffix}
            </h2>
            <p className="lede">{agents.lede}</p>
            <span className="pro-pill">{agents.pill}</span>
          </div>
          <div className="thoughts">
            <div className="thought rv">
              <div className="who">{agents.t1Who}</div>
              <p>
                <b>{lang === "en" ? "Outwardly: " : lang === "zhHans" ? "表面：" : "表面："}</b>
                {agents.t1Surface}
                <br />
                <b>{lang === "en" ? "Inwardly: " : lang === "zhHans" ? "内心：" : "內心："}</b>
                {agents.t1Inner}
              </p>
            </div>
            <div className="thought rv">
              <div className="who">{agents.t2Who}</div>
              <p>
                <b>{lang === "en" ? "Outwardly: " : lang === "zhHans" ? "表面：" : "表面："}</b>
                {agents.t2Surface}
                <br />
                <b>{lang === "en" ? "Inwardly: " : lang === "zhHans" ? "内心：" : "內心："}</b>
                {agents.t2Inner}
              </p>
            </div>
            <div className="thought rv">
              <div className="who">{agents.t3Who}</div>
              <p>
                <b>{lang === "en" ? "Outwardly: " : lang === "zhHans" ? "表面：" : "表面："}</b>
                {agents.t3Surface}
                <br />
                <b>{lang === "en" ? "Inwardly: " : lang === "zhHans" ? "内心：" : "內心："}</b>
                {agents.t3Inner}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── ADAPTIVE · per-story interface ── */}
      <section className="adaptive" id="adaptive">
        <div className="wrap">
          <div className="head rv">
            <h2>
              {adaptive.titlePre}
              <span className="hi">{adaptive.titleAccent}</span>
              {adaptive.titleSuffix}
            </h2>
            <p className="lede">{adaptive.lede}</p>
          </div>
          <div className="panels">
            <div className="panelx main rv">
              <div className="tag">{adaptive.p1Tag}</div>
              {adaptive.p1Rows.map(([lab, val], i) => (
                <div className="row" key={lab}>
                  <span className="lab">{lab}</span>
                  {i === 0 || i === 1 ? (
                    <span className="ring-wrap">
                      <span className="barx">
                        <i style={{ width: i === 0 ? "80%" : "66%" }} />
                      </span>
                      <span className="val">{val}</span>
                    </span>
                  ) : (
                    <span className="val">{val}</span>
                  )}
                </div>
              ))}
            </div>
            <div className="panelx rv">
              <div className="tag">{adaptive.p2Tag}</div>
              {adaptive.p2Rows.map(([lab, val]) => (
                <div className="row" key={lab}>
                  <span className="lab">{lab}</span>
                  <span className="val">{val}</span>
                </div>
              ))}
            </div>
            <div className="panelx rv">
              <div className="tag">{adaptive.p3Tag}</div>
              {adaptive.p3Rows.map(([lab, val], i) => (
                <div className="row" key={lab}>
                  <span className="lab">{lab}</span>
                  {i === 0 ? (
                    <span className="ring-wrap">
                      <span className="barx">
                        <i style={{ width: "72%" }} />
                      </span>
                      <span className="val">{val}</span>
                    </span>
                  ) : (
                    <span className="val">{val}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── BILINGUAL · statement band ── */}
      <section className="bilingual" id="bilingual">
        <div className="wrap rv">
          <h2>
            {bilingual.titlePre}
            <span className="hi">{bilingual.titleAccent}</span>
            {bilingual.titleSuffix}
          </h2>
          <p className="lede">{bilingual.lede}</p>
          <div className="stats">
            <div className="stat">
              <div className="n">{bilingual.stat1Num}</div>
              <div className="l">{bilingual.stat1Label}</div>
            </div>
            <div className="stat">
              <div className="n">{bilingual.stat2Num}</div>
              <div className="l">{bilingual.stat2Label}</div>
            </div>
            <div className="stat">
              <div className="n">{bilingual.stat3Num}</div>
              <div className="l">{bilingual.stat3Label}</div>
            </div>
            <div className="stat">
              <div className="n">{bilingual.stat4Num}</div>
              <div className="l">{bilingual.stat4Label}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ADULT · quiet card · 18+ self-attest ── */}
      <section className="adult" id="adult">
        <div className="wrap">
          <div className="card rv">
            <div className="eyebrow">{adult.eyebrow}</div>
            <h2>{adult.title}</h2>
            <p>{adult.p}</p>
            <div className="pills">
              <span className="pill">{adult.pill1}</span>
              <span className="pill">{adult.pill2}</span>
              <span className="pill">{adult.pill3}</span>
              <span className="pill">{adult.pill4}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="ctaX" id="cta">
        <div className="wrap rv">
          <h2>
            {cta.titlePre}
            <span className="hi">{cta.titleAccent}</span>
            {cta.titleSuffix}
          </h2>
          <p className="lede">{cta.lede}</p>
          <div className="cta-row center">
            <a className="btn-p" href={APP_LOGIN}>
              {signup}
            </a>
            <a className="btn-s" href={APP_LIBRARY}>
              {cta.ctaSecondary}
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="kfoot">
        <div className="wrap foot-in">
          <a href="#hero" className="brand">
            <span className="k-mark">(o)</span>
            <span className="k-word">KIEIO</span>
          </a>
          <div className="meta">© {new Date().getFullYear()} Kieio · kieio.com · /KEE-yo/</div>
        </div>
      </footer>
    </div>
  );
}

// All CSS inlined (same pattern as the previous landing) — single-purpose page,
// co-located styles keep the redesign reversible.
const MARKETING_CSS = `
.kieio-marketing{
  --bg:#0a0a0c; --bg2:#121216; --bg3:#17171c;
  --fg:#f5f4f7;
  --mist:rgba(245,244,247,.66);
  --dim:rgba(245,244,247,.42);
  --line:rgba(255,255,255,.08);
  --brand:#552583;
  --brand-mid:#7c4dab;
  --brand-hi:#b794e0;
  --glow:rgba(85,37,131,.32);
  --radius:16px;
  --sans:'Geist','Noto Sans TC',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  --tc:'Noto Sans TC','Geist',sans-serif;
  --mono:var(--font-geist-mono),'JetBrains Mono',ui-monospace,monospace;
  background:var(--bg);color:var(--fg);
  font-family:var(--sans);
  -webkit-font-smoothing:antialiased;
  min-height:100vh;overflow-x:hidden;
}
.kieio-marketing *{margin:0;padding:0;box-sizing:border-box}
.kieio-marketing ::selection{background:var(--brand);color:#fff}
.kieio-marketing a{color:inherit;text-decoration:none}
.kieio-marketing .wrap{max-width:1240px;margin:0 auto;padding:0 32px}
@media(max-width:768px){.kieio-marketing .wrap{padding:0 20px}}
.kieio-marketing .nav-sentinel{position:absolute;top:60px;left:0;height:1px;width:1px;pointer-events:none}

.kieio-marketing .k-mark{font-family:var(--font-gimbal),sans-serif;font-weight:400;letter-spacing:-.025em;line-height:1;display:inline-block;color:var(--brand-hi)}
.kieio-marketing .k-word{font-family:var(--font-termina),sans-serif;font-weight:700;letter-spacing:-.05em;line-height:1;display:inline-block}
.kieio-marketing .brand{display:inline-flex;align-items:center;gap:.4em;white-space:nowrap;font-size:17px}

/* reveal on scroll */
.kieio-marketing .rv{opacity:0;transform:translateY(26px);transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1)}
.kieio-marketing .rv.in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){
  .kieio-marketing .rv{opacity:1;transform:none;transition:none}
  .kieio-marketing .msg{animation:none!important;opacity:1!important;transform:none!important}
  .kieio-marketing .typing i{animation:none!important}
}

/* ── NAV ── */
.kieio-marketing .knav{position:fixed;top:0;left:0;right:0;z-index:50;height:68px;display:flex;align-items:center;transition:background .3s,border-color .3s;border-bottom:1px solid transparent}
.kieio-marketing .knav.scrolled{background:rgba(10,10,12,.82);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-bottom-color:var(--line)}
.kieio-marketing .knav-in{max-width:1240px;margin:0 auto;padding:0 32px;width:100%;display:flex;align-items:center;gap:30px}
.kieio-marketing .knav-links{display:flex;gap:26px;font-size:14px;color:var(--mist);margin-left:auto;align-items:center;font-family:var(--tc)}
.kieio-marketing .knav-links a:hover{color:var(--fg)}
.kieio-marketing .locale-switch{display:inline-flex;gap:7px;align-items:center;font-family:var(--mono);font-size:11.5px;color:var(--dim)}
.kieio-marketing .locale-switch .sep{margin-right:7px;color:var(--line)}
.kieio-marketing .locale-switch a:hover{color:var(--fg)}
.kieio-marketing .locale-switch .locale-active{color:var(--brand-hi)}
.kieio-marketing .knav-cta{padding:10px 20px;background:var(--brand);color:#fff;border-radius:999px;font-size:13.5px;font-weight:600;white-space:nowrap;transition:background .2s,transform .15s;font-family:var(--tc)}
.kieio-marketing .knav-cta:hover{background:var(--brand-mid)}
.kieio-marketing .knav-cta:active{transform:scale(.98)}
@media(max-width:960px){.kieio-marketing .knav-links{display:none}}

/* ── HERO ── */
.kieio-marketing .hero{min-height:100dvh;display:flex;align-items:center;position:relative;padding-top:88px;padding-bottom:64px;
  background:
    radial-gradient(1100px 520px at 78% 12%, rgba(85,37,131,.20), transparent 62%),
    radial-gradient(700px 420px at 8% 88%, rgba(85,37,131,.10), transparent 60%),
    var(--bg)}
.kieio-marketing .hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:64px;align-items:center;width:100%}
@media(max-width:980px){.kieio-marketing .hero-grid{grid-template-columns:1fr;gap:44px}}
.kieio-marketing .hero h1{font-family:var(--tc);font-weight:900;font-size:clamp(40px,5.6vw,72px);line-height:1.12;letter-spacing:-.02em}
.kieio-marketing .hi{color:var(--brand-hi)}
.kieio-marketing .hero .sub{margin-top:22px;font-family:var(--tc);font-size:17px;line-height:1.85;color:var(--mist);max-width:30em}
.kieio-marketing .cta-row{margin-top:34px;display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.kieio-marketing .cta-row.center{justify-content:center;margin-top:38px}
.kieio-marketing .btn-p{padding:15px 30px;background:var(--brand);color:#fff;border-radius:999px;font-size:16px;font-weight:700;font-family:var(--tc);box-shadow:0 10px 36px var(--glow);transition:background .2s,transform .15s;white-space:nowrap}
.kieio-marketing .btn-p:hover{background:var(--brand-mid)}
.kieio-marketing .btn-p:active{transform:translateY(1px) scale(.99)}
.kieio-marketing .btn-s{padding:15px 26px;border:1px solid var(--line);border-radius:999px;font-size:15px;font-weight:500;font-family:var(--tc);color:var(--mist);transition:border-color .2s,color .2s;white-space:nowrap}
.kieio-marketing .btn-s:hover{border-color:var(--brand-mid);color:var(--fg)}

.kieio-marketing .chat{background:rgba(18,18,22,.88);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;
  box-shadow:0 28px 90px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.02), 0 24px 80px var(--glow);transform:rotate(.6deg)}
@media(max-width:980px){.kieio-marketing .chat{transform:none}}
.kieio-marketing .chat-bar{display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.02)}
.kieio-marketing .chat-bar .t{font-family:var(--tc);font-size:13px;color:var(--mist);font-weight:500}
.kieio-marketing .chat-bar .live{margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--brand-hi);letter-spacing:.12em;display:flex;align-items:center;gap:6px}
.kieio-marketing .chat-bar .live::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--brand-hi)}
.kieio-marketing .chat-body{padding:20px 18px;display:flex;flex-direction:column;gap:14px;min-height:380px}
.kieio-marketing .msg{max-width:92%;opacity:0;transform:translateY(12px);animation:kioMsgIn .6s cubic-bezier(.16,1,.3,1) forwards}
.kieio-marketing .msg .who{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--dim);margin-bottom:6px}
.kieio-marketing .msg .bub{font-family:var(--tc);font-size:14.5px;line-height:1.8;color:var(--fg);background:rgba(255,255,255,.035);border:1px solid var(--line);border-radius:12px;padding:12px 15px}
.kieio-marketing .msg .bub .em{color:var(--brand-hi);font-weight:700}
.kieio-marketing .msg.you{align-self:flex-end;text-align:right}
.kieio-marketing .msg.you .bub{background:rgba(85,37,131,.20);border-color:rgba(124,77,171,.35)}
.kieio-marketing .msg .mem{margin-top:7px;font-family:var(--mono);font-size:10px;color:var(--brand-hi);letter-spacing:.06em}
.kieio-marketing .msg:nth-child(1){animation-delay:.4s}
.kieio-marketing .msg:nth-child(2){animation-delay:1.3s}
.kieio-marketing .msg:nth-child(3){animation-delay:2.2s}
.kieio-marketing .msg:nth-child(4){animation-delay:3.2s}
@keyframes kioMsgIn{to{opacity:1;transform:none}}
.kieio-marketing .chat-input{display:flex;align-items:center;gap:10px;margin:0 18px 18px;border:1px solid var(--line);border-radius:12px;padding:12px 16px;color:var(--dim);font-family:var(--tc);font-size:13.5px;background:rgba(255,255,255,.02)}
.kieio-marketing .typing{margin-left:auto;display:flex;gap:3px}
.kieio-marketing .typing i{width:4px;height:4px;border-radius:50%;background:var(--brand-hi);animation:kioTp 1.2s infinite}
.kieio-marketing .typing i:nth-child(2){animation-delay:.15s}
.kieio-marketing .typing i:nth-child(3){animation-delay:.3s}
@keyframes kioTp{0%,60%,100%{opacity:.25}30%{opacity:1}}

/* ── sections base ── */
.kieio-marketing section{padding:128px 0}
@media(max-width:768px){.kieio-marketing section{padding:84px 0}}
.kieio-marketing .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--brand-hi);margin-bottom:18px}
.kieio-marketing h2{font-family:var(--tc);font-weight:900;font-size:clamp(30px,3.8vw,52px);line-height:1.2;letter-spacing:-.015em}
.kieio-marketing .lede{margin-top:18px;font-family:var(--tc);font-size:16.5px;line-height:1.9;color:var(--mist);max-width:36em}

/* ── STORIES stage ── */
.kieio-marketing .stories{padding:0}
.kieio-marketing .stage{min-height:100dvh;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden;padding:96px 0 64px}
.kieio-marketing .stage-wrap{width:100%}
.kieio-marketing .stage .head{max-width:760px;margin-bottom:44px}
.kieio-marketing .folder{position:absolute;left:50%;top:56%;transform:translate(-50%,-50%);z-index:5;opacity:0;pointer-events:none}
.kieio-marketing .folder .body{width:150px;height:108px;border-radius:14px;position:relative;
  background:linear-gradient(165deg,#2a2333,#171221);border:1px solid rgba(183,148,224,.35);
  box-shadow:0 24px 70px rgba(0,0,0,.55), 0 0 60px var(--glow)}
.kieio-marketing .folder .body::before{content:"";position:absolute;top:-13px;left:12px;width:58px;height:18px;border-radius:8px 8px 0 0;
  background:linear-gradient(165deg,#2a2333,#1c1626);border:1px solid rgba(183,148,224,.3);border-bottom:none}
.kieio-marketing .folder .lab{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--tc);font-weight:700;font-size:17px;color:var(--brand-hi)}
.kieio-marketing .folder .ring{position:absolute;left:50%;top:50%;width:170px;height:170px;border-radius:50%;transform:translate(-50%,-50%) scale(.4);border:1.5px solid var(--brand-hi);opacity:0}
.kieio-marketing .cursorx{position:absolute;z-index:6;width:26px;height:26px;left:0;top:0;opacity:0;pointer-events:none;filter:drop-shadow(0 4px 14px rgba(0,0,0,.6))}
.kieio-marketing .pgrid{display:grid;grid-template-columns:repeat(5,minmax(0,176px));gap:18px;justify-content:center}
@media(max-width:860px){
  .kieio-marketing .stage{min-height:0;padding:84px 0}
  .kieio-marketing .folder,.kieio-marketing .cursorx{display:none}
  .kieio-marketing .pgrid{grid-template-columns:repeat(2,1fr);gap:14px}
}
.kieio-marketing .poster{aspect-ratio:198/282;border-radius:14px;position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.09);transition:transform .35s cubic-bezier(.16,1,.3,1)}
.kieio-marketing .poster:hover{transform:translateY(-8px)}
.kieio-marketing .poster .glyph{position:absolute;right:-12px;top:2px;font-family:var(--tc);font-weight:900;font-size:150px;line-height:1;opacity:.14;color:#fff}
.kieio-marketing .poster .meta{position:absolute;left:0;right:0;bottom:0;padding:38px 16px 14px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.78))}
.kieio-marketing .poster .zh{font-family:var(--tc);font-weight:700;font-size:16px}
.kieio-marketing .poster .en{font-family:var(--mono);font-size:9.5px;color:rgba(255,255,255,.62);margin-top:4px;letter-spacing:.06em}
.kieio-marketing .a1{background:linear-gradient(155deg,#2b1a10,#0d0b0f 58%),radial-gradient(420px 220px at 80% 8%,rgba(255,122,40,.5),transparent 60%);background-blend-mode:screen}
.kieio-marketing .a2{background:linear-gradient(160deg,#1d1410,#0b0a0d 60%),radial-gradient(300px 300px at 22% 18%,rgba(255,196,110,.4),transparent 65%);background-blend-mode:screen}
.kieio-marketing .a3{background:linear-gradient(150deg,#101622,#0a0b10 62%),radial-gradient(360px 260px at 75% 80%,rgba(96,150,255,.35),transparent 60%);background-blend-mode:screen}
.kieio-marketing .a4{background:linear-gradient(165deg,#1a2030,#0a0a0c 55%),radial-gradient(340px 220px at 25% 85%,rgba(110,200,190,.28),transparent 60%);background-blend-mode:screen}
.kieio-marketing .a5{background:linear-gradient(150deg,#241026,#0c0a0f 60%),radial-gradient(380px 260px at 78% 16%,rgba(228,92,200,.34),transparent 62%);background-blend-mode:screen}
.kieio-marketing .a6{background:linear-gradient(158deg,#10201a,#0a0c0b 58%),radial-gradient(320px 240px at 70% 78%,rgba(110,228,168,.3),transparent 60%);background-blend-mode:screen}
.kieio-marketing .a7{background:linear-gradient(152deg,#241616,#0d0a0a 60%),radial-gradient(340px 240px at 30% 16%,rgba(255,96,96,.3),transparent 62%);background-blend-mode:screen}
.kieio-marketing .a8{background:linear-gradient(160deg,#1c1430,#0b0a10 58%),radial-gradient(360px 260px at 72% 20%,rgba(150,110,255,.38),transparent 60%);background-blend-mode:screen}
.kieio-marketing .a9{background:linear-gradient(150deg,#202016,#0c0c0a 62%),radial-gradient(340px 220px at 26% 80%,rgba(214,220,120,.26),transparent 60%);background-blend-mode:screen}
.kieio-marketing .a10{background:linear-gradient(156deg,#102024,#0a0c0d 58%),radial-gradient(360px 260px at 76% 82%,rgba(80,210,235,.3),transparent 62%);background-blend-mode:screen}

/* ── HOW ── */
.kieio-marketing .how{background:linear-gradient(180deg,var(--bg) 0%,#0d0c11 50%,var(--bg) 100%)}
.kieio-marketing .how .head{max-width:640px;margin-bottom:72px}
.kieio-marketing .acts{position:relative;max-width:900px;margin:0 auto}
.kieio-marketing .acts::before{content:"";position:absolute;left:31px;top:8px;bottom:8px;width:1px;background:linear-gradient(180deg,transparent,var(--brand-mid) 12%,var(--brand-mid) 88%,transparent)}
.kieio-marketing .act{position:relative;padding-left:96px;display:grid;grid-template-columns:1fr 1fr;gap:36px;align-items:center}
.kieio-marketing .act+.act{margin-top:84px}
.kieio-marketing .act .num{position:absolute;left:0;top:0;width:62px;height:62px;border-radius:50%;background:var(--bg);border:1px solid var(--brand-mid);display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:15px;color:var(--brand-hi)}
.kieio-marketing .act h3{font-family:var(--tc);font-weight:900;font-size:26px;letter-spacing:-.01em}
.kieio-marketing .act p{margin-top:12px;font-family:var(--tc);font-size:15.5px;line-height:1.9;color:var(--mist)}
.kieio-marketing .act .panel{background:var(--bg2);border:1px solid var(--line);border-radius:var(--radius);padding:20px 22px;font-family:var(--tc);font-size:14px;line-height:1.85;color:var(--mist);box-shadow:0 16px 50px rgba(0,0,0,.35)}
.kieio-marketing .act .panel .tag{font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--brand-hi);margin-bottom:10px}
.kieio-marketing .act .panel .choice{margin-top:9px;border:1px solid var(--line);border-radius:10px;padding:9px 13px;font-size:13.5px;color:var(--fg);transition:border-color .2s,background .2s;cursor:default}
.kieio-marketing .act .panel .choice:hover{border-color:var(--brand-mid);background:rgba(85,37,131,.10)}
@media(max-width:860px){
  .kieio-marketing .act{grid-template-columns:1fr;padding-left:64px}
  .kieio-marketing .acts::before{left:23px}
  .kieio-marketing .act .num{width:46px;height:46px}
}

/* ── MEMORY bento ── */
.kieio-marketing .memory .head{max-width:700px;margin-bottom:60px}
.kieio-marketing .bento{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.kieio-marketing .cell{background:var(--bg2);border:1px solid var(--line);border-radius:var(--radius);padding:30px 28px;position:relative;overflow:hidden;transition:transform .35s cubic-bezier(.16,1,.3,1),border-color .3s}
.kieio-marketing .cell:hover{transform:translateY(-5px);border-color:rgba(124,77,171,.4)}
.kieio-marketing .cell.big{grid-column:span 2;background:radial-gradient(560px 300px at 88% -10%, rgba(85,37,131,.26), transparent 60%),var(--bg2)}
.kieio-marketing .cell h3{font-family:var(--tc);font-weight:700;font-size:20px;margin-bottom:12px}
.kieio-marketing .cell .k{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--brand-hi);display:block;margin-bottom:14px}
.kieio-marketing .cell p{font-family:var(--tc);font-size:14.5px;line-height:1.85;color:var(--mist)}
.kieio-marketing .cell .frag{margin-top:18px;border-left:2px solid var(--brand-mid);padding:10px 14px;background:rgba(85,37,131,.08);font-family:var(--tc);font-size:13.5px;line-height:1.8;color:var(--fg);border-radius:0 10px 10px 0}
.kieio-marketing .cell .frag .m{font-family:var(--mono);font-size:10px;color:var(--brand-hi);display:block;margin-top:8px}
.kieio-marketing .cell.stat-cell{display:flex;align-items:center;justify-content:center;text-align:center;background:radial-gradient(300px 200px at 50% 50%, rgba(85,37,131,.25), transparent 70%),var(--bg2)}
.kieio-marketing .cell .big-n{font-family:var(--tc);font-weight:900;font-size:44px;color:var(--brand-hi);letter-spacing:-.02em}
.kieio-marketing .cell .big-l{margin-top:6px;font-family:var(--tc);font-size:13.5px;color:var(--dim)}
@media(max-width:900px){.kieio-marketing .bento{grid-template-columns:1fr}.kieio-marketing .cell.big{grid-column:span 1}}

/* ── AGENTS ── */
.kieio-marketing .agents{background:linear-gradient(180deg,var(--bg),#0e0b13 55%,var(--bg))}
.kieio-marketing .agents .head{max-width:680px}
.kieio-marketing .pro-pill{display:inline-flex;align-items:center;gap:8px;margin-top:20px;padding:7px 16px;border-radius:999px;background:rgba(85,37,131,.18);border:1px solid rgba(124,77,171,.4);font-family:var(--tc);font-size:12.5px;color:var(--brand-hi);font-weight:500}
.kieio-marketing .thoughts{margin-top:64px;display:grid;grid-template-columns:repeat(3,1fr);gap:22px;align-items:start}
.kieio-marketing .thought{background:var(--bg2);border:1px solid var(--line);border-radius:var(--radius);padding:26px 24px;transition:transform .35s cubic-bezier(.16,1,.3,1)}
.kieio-marketing .thought:hover{transform:translateY(-6px)}
.kieio-marketing .thought:nth-child(2){margin-top:44px}
.kieio-marketing .thought:nth-child(3){margin-top:88px}
.kieio-marketing .thought .who{font-family:var(--tc);font-weight:700;font-size:15.5px;margin-bottom:14px;display:flex;align-items:center;gap:10px}
.kieio-marketing .thought .who::before{content:"";width:30px;height:30px;border-radius:50%;flex-shrink:0;background:radial-gradient(circle at 32% 30%,var(--brand-mid),var(--brand) 70%)}
.kieio-marketing .thought p{font-family:var(--tc);font-size:14px;line-height:1.9;color:var(--mist)}
.kieio-marketing .thought p b{color:var(--fg);font-weight:600}
@media(max-width:900px){.kieio-marketing .thoughts{grid-template-columns:1fr}.kieio-marketing .thought:nth-child(2),.kieio-marketing .thought:nth-child(3){margin-top:0}}

/* ── ADAPTIVE ── */
.kieio-marketing .adaptive .head{max-width:700px;margin-bottom:60px}
.kieio-marketing .panels{display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:auto auto;gap:18px}
.kieio-marketing .panelx{background:var(--bg2);border:1px solid var(--line);border-radius:var(--radius);padding:26px;position:relative;overflow:hidden}
.kieio-marketing .panelx.main{grid-row:span 2;background:radial-gradient(480px 320px at 12% -8%, rgba(85,37,131,.22), transparent 58%),var(--bg2)}
.kieio-marketing .panelx .tag{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--brand-hi);margin-bottom:18px}
.kieio-marketing .row{display:flex;justify-content:space-between;align-items:center;font-family:var(--tc);font-size:14px;padding:11px 2px;border-bottom:1px dashed rgba(255,255,255,.07);gap:14px}
.kieio-marketing .row:last-child{border-bottom:none}
.kieio-marketing .row .lab{color:var(--mist)}
.kieio-marketing .row .val{color:var(--fg);font-weight:600;text-align:right}
.kieio-marketing .ring-wrap{display:inline-flex;align-items:center;gap:8px}
.kieio-marketing .barx{height:6px;border-radius:99px;background:rgba(255,255,255,.07);width:120px;overflow:hidden}
.kieio-marketing .barx i{display:block;height:100%;background:linear-gradient(90deg,var(--brand-mid),var(--brand-hi))}
@media(max-width:900px){.kieio-marketing .panels{grid-template-columns:1fr}.kieio-marketing .panelx.main{grid-row:span 1}}

/* ── BILINGUAL ── */
.kieio-marketing .bilingual h2{font-size:clamp(36px,5vw,64px);max-width:13em}
.kieio-marketing .bilingual .lede{max-width:33em}
.kieio-marketing .stats{margin-top:64px;display:grid;grid-template-columns:repeat(4,1fr);gap:0;border-top:1px solid var(--line)}
.kieio-marketing .stat{padding:30px 24px 6px;border-left:1px solid var(--line)}
.kieio-marketing .stat:first-child{border-left:none;padding-left:0}
.kieio-marketing .stat .n{font-family:var(--tc);font-weight:900;font-size:34px;color:var(--brand-hi);letter-spacing:-.02em}
.kieio-marketing .stat .l{margin-top:8px;font-family:var(--tc);font-size:13px;color:var(--dim)}
@media(max-width:768px){.kieio-marketing .stats{grid-template-columns:1fr 1fr}.kieio-marketing .stat:nth-child(3){border-left:none;padding-left:0}}

/* ── ADULT ── */
.kieio-marketing .adult .card{max-width:880px;margin:0 auto;background:var(--bg2);border:1px solid var(--line);border-radius:var(--radius);padding:52px 56px;text-align:center}
.kieio-marketing .adult .eyebrow{margin-bottom:14px}
.kieio-marketing .adult h2{font-size:clamp(26px,3vw,40px)}
.kieio-marketing .adult p{margin:20px auto 0;font-family:var(--tc);font-size:15.5px;line-height:1.9;color:var(--mist);max-width:34em}
.kieio-marketing .pills{margin-top:30px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.kieio-marketing .pill{padding:9px 18px;border-radius:999px;border:1px solid var(--line);font-family:var(--tc);font-size:13px;color:var(--mist)}
@media(max-width:640px){.kieio-marketing .adult .card{padding:40px 24px}}

/* ── CTA ── */
.kieio-marketing .ctaX{padding:160px 0 140px;text-align:center;position:relative;background:radial-gradient(800px 420px at 50% 20%, rgba(85,37,131,.22), transparent 65%),var(--bg)}
.kieio-marketing .ctaX h2{font-size:clamp(38px,5.4vw,68px)}
.kieio-marketing .ctaX .lede{margin:22px auto 0}

/* ── FOOTER ── */
.kieio-marketing .kfoot{border-top:1px solid var(--line);padding:44px 0;font-family:var(--tc)}
.kieio-marketing .foot-in{display:flex;align-items:center;gap:28px;flex-wrap:wrap}
.kieio-marketing .foot-in .meta{margin-left:auto;font-size:13px;color:var(--dim);font-family:var(--mono)}
`;
