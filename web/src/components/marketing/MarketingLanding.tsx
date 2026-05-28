"use client";

/**
 * Marketing landing page · ported from pm/design-update-v5/Kieio Marketing.html
 *
 * Dark cinematic single-page · 7 scroll-locked sections:
 *   1. Hero · animated chat preview (廣東話 dialogue · 阿美 NPC)
 *   2. Stream · cursor clicks folder · 12 story posters fan out
 *   3. How it works · 3-step (seed → world → live) with synced story panels
 *   4. Memory · 3 layer architecture cards (Episodic / Semantic / Emotional)
 *   5. Bilingual · 廣東話 + 繁中 focus + stats panel
 *   6. Adult mode · KYC opt-in pills
 *   7. CTA · 「第一段故事永遠係免費」 + (o) KIEIO logo
 *
 * All scroll animations use requestAnimationFrame + IntersectionObserver.
 * No external animation libs · pure CSS transitions + JS scroll math.
 *
 * Routing
 * -------
 * - kieio.com/ (marketing subdomain) renders this component
 * - app.kieio.com/ middleware redirects to /library (never reaches this)
 * - localhost / preview: renders for all users (dev convenience)
 */

import { useEffect, useRef } from "react";
import { MARKETING_COPY, LOCALE_SWITCHER, type MarketingLang } from "./copy";
import { appUrl } from "@/lib/urls";

const STORIES = [
  { art: 1, tag: "Wuxia", live: true, rating: "TV-MA", zh: "長安十二時辰", en: "Chang'an, Twelve Hours", plays: "4.2K", turn: "turn 18" },
  { art: 2, tag: "Slice of Life", live: false, rating: "PG-13", zh: "深夜咖啡店", en: "Midnight Coffee Shop", plays: "12.1K", turn: "turn 41" },
  { art: 3, tag: "Mystery", live: true, rating: "PG-13", zh: "Last Light, Kyoto", en: "Last Light, Kyoto", plays: "892", turn: "turn 7" },
  { art: 4, tag: "Post-Apoc", live: false, rating: "TV-MA", zh: "末世香港", en: "Hong Kong, After", plays: "6.8K", turn: "turn 92" },
  { art: 5, tag: "Sci-Fi", live: false, rating: "TV-14", zh: "月球殖民 2089", en: "Moon Colony 2089", plays: "2.4K", turn: "turn 23" },
  { art: 6, tag: "Romance", live: true, rating: "TV-14", zh: "校園戀曲", en: "Campus Notes", plays: "8.9K", turn: "turn 12" },
  { art: 7, tag: "Period", live: false, rating: "TV-14", zh: "1925 上海", en: "Shanghai, 1925", plays: "1.6K", turn: "turn 34" },
  { art: 8, tag: "Cyberpunk", live: true, rating: "TV-MA", zh: "Cyberpunk 九龍", en: "Cyberpunk Kowloon", plays: "11.3K", turn: "turn 56" },
  { art: 9, tag: "Horror", live: false, rating: "TV-MA", zh: "七月半", en: "Mid-Seventh Moon", plays: "3.7K", turn: "turn 8" },
  { art: 10, tag: "Adventure", live: false, rating: "PG-13", zh: "極光下嘅信", en: "A Letter Under Aurora", plays: "2.1K", turn: "turn 19" },
  { art: 11, tag: "Thriller", live: true, rating: "TV-MA", zh: "電梯裏面嘅人", en: "The Stranger in the Lift", plays: "5.9K", turn: "turn 14" },
  { art: 12, tag: "Fantasy", live: false, rating: "TV-14", zh: "古長安妖", en: "Demons of Old Chang'an", plays: "4.4K", turn: "turn 27" },
] as const;

const SECTIONS = ["hero", "portal", "how", "memory", "agents", "adaptive", "bilingual", "adult", "cta"] as const;

export function MarketingLanding({
  lang,
  locale,
  authedUser,
}: {
  lang: MarketingLang;
  locale: string;
  /** Session 16 P-06: if user is already logged in on .kieio.com cookie scope,
   *  render「Open app」CTA instead of「Sign up」. */
  authedUser?: { displayName: string | null } | null;
}) {
  const nav = MARKETING_COPY.nav[lang];
  const hero = MARKETING_COPY.hero[lang];
  const stream = MARKETING_COPY.stream[lang];
  const how = MARKETING_COPY.how[lang];
  const memory = MARKETING_COPY.memory[lang];
  const agents = MARKETING_COPY.agents[lang];
  const adaptive = MARKETING_COPY.adaptive[lang];
  const bilingual = MARKETING_COPY.bilingual[lang];
  const adult = MARKETING_COPY.adult[lang];
  const cta = MARKETING_COPY.cta[lang];
  const misc = MARKETING_COPY.misc[lang];
  const APP_LOGIN = appUrl(`/${locale}/login`);
  const APP_LIBRARY = appUrl(`/${locale}/library`);
  const progressRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const streamSectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);
  const folderAnchorRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<SVGSVGElement>(null);
  const howSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const progress = progressRef.current;
    const nav = navRef.current;
    const counterDots = counterRef.current?.querySelectorAll<HTMLElement>(".counter-dot");
    const streamSection = streamSectionRef.current;
    const stage = stageRef.current;
    const folder = folderRef.current;
    const folderAnchor = folderAnchorRef.current;
    const cursor = cursorRef.current;
    const howSection = howSectionRef.current;
    if (!progress || !nav || !streamSection || !stage || !folder || !folderAnchor || !cursor || !howSection) return;

    function updateProgress() {
      if (!progress || !nav) return;
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const p = Math.min(1, window.scrollY / docH);
      progress.style.width = p * 100 + "%";
      nav.classList.toggle("scrolled", window.scrollY > 50);
    }

    // Section visibility → in-view class + counter dot active state
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            const id = e.target.id;
            counterDots?.forEach((d) => d.classList.toggle("active", d.dataset.target === id));
          }
        });
      },
      { threshold: 0.4 },
    );
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });

    // Memory cards in-view
    const cardIO = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("in-view");
        });
      },
      { threshold: 0.2 },
    );
    document.querySelectorAll(".memory-card").forEach((c) => cardIO.observe(c));

    function getSectionProgress(el: Element) {
      const rect = el.getBoundingClientRect();
      const winH = window.innerHeight;
      const total = rect.height - winH;
      const scrolled = -rect.top;
      return Math.max(0, Math.min(1, scrolled / total));
    }

    // STREAM animation · cursor + folder + 12 poster cards
    const POSTER_W = 200,
      POSTER_H = 286;
    const COLS = 4,
      ROWS = 3;
    const GAP_X = 30,
      GAP_Y = 22;
    function rng(seed: number) {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    }
    const posterMeta = STORIES.map((_, i) => {
      const col = i % COLS,
        row = Math.floor(i / COLS);
      const dx = (col - (COLS - 1) / 2) * (POSTER_W + GAP_X);
      const dy = (row - (ROWS - 1) / 2) * (POSTER_H + GAP_Y) - 60;
      const rot = (rng(i * 7) - 0.5) * 8;
      const burstAngle = Math.atan2(dy, dx);
      return {
        dx,
        dy,
        rot,
        midDx: dx * 0.4 + Math.cos(burstAngle + 0.3) * 80,
        midDy: dy * 0.4 + Math.sin(burstAngle + 0.3) * 80 - 40,
        midRot: (rng(i * 11) - 0.5) * 80,
        delay: i * 0.03,
      };
    });
    void POSTER_W;
    void POSTER_H; // keep refs alive for clarity

    function viewportCenter() {
      if (!folderAnchor || !stage) return { x: 0, y: 0 };
      const rect = folderAnchor.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - stageRect.left,
        y: rect.top + rect.height / 2 - stageRect.top,
      };
    }

    function easeOutCubic(t: number) {
      return 1 - Math.pow(1 - t, 3);
    }
    function easeOutBack(t: number) {
      const c1 = 1.70158,
        c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    const posters = Array.from(stage.querySelectorAll<HTMLElement>(".poster"));

    let lastPhase: "idle" | "approach" | "click" | "fan" = "idle";

    function updateStream() {
      if (!streamSection || !stage || !folder || !folderAnchor || !cursor) return;
      const rect = streamSection.getBoundingClientRect();
      const winH = window.innerHeight;
      if (rect.top > winH || rect.bottom < 0) return;
      const total = Math.max(1, rect.height - winH);
      const p = Math.max(0, Math.min(1, -rect.top / total));

      const stageRect = stage.getBoundingClientRect();
      const fc = viewportCenter();

      let phase: "approach" | "click" | "fan";
      if (p < 0.2) phase = "approach";
      else if (p < 0.26) phase = "click";
      else phase = "fan";

      let curX: number, curY: number;
      if (p < 0.2) {
        const tp = easeOutCubic(p / 0.2);
        const startX = stageRect.width * 0.78;
        const startY = stageRect.height * 0.18;
        curX = startX + (fc.x + 30 - startX) * tp;
        curY = startY + (fc.y - 10 - startY) * tp;
      } else {
        curX = fc.x + 30;
        curY = fc.y - 10;
      }
      cursor.style.transform = `translate(${curX}px,${curY}px)`;
      cursor.style.opacity = p > 0.95 ? "0" : "1";
      cursor.style.transition = "opacity 0.4s ease";

      if (phase === "click" && lastPhase !== "click") {
        folder.classList.add("click-pulse");
        cursor.classList.add("clicking");
        setTimeout(() => cursor.classList.remove("clicking"), 600);
        setTimeout(() => folder.classList.remove("click-pulse"), 500);
        setTimeout(() => folder.classList.add("open"), 240);
      }
      if (phase === "approach") {
        folder.classList.remove("open");
      }
      lastPhase = phase;

      const folderOp = p < 0.3 ? 1 : Math.max(0, 1 - (p - 0.3) / 0.2);
      folderAnchor.style.opacity = folderOp.toFixed(3);

      posters.forEach((el, i) => {
        const m = posterMeta[i];
        const startP = 0.26 + m.delay;
        const endP = 0.85;
        const local = (p - startP) / (endP - startP);
        if (local < 0) {
          el.style.transform = `translate(0px,-30px) scale(0.05) rotate(0deg)`;
          el.style.opacity = "0";
          return;
        }
        const lc = Math.max(0, Math.min(1, local));
        let dx: number, dy: number, rot: number, scale: number;
        if (lc < 0.4) {
          const t = easeOutCubic(lc / 0.4);
          dx = 0 + (m.midDx - 0) * t;
          dy = -30 + (m.midDy - -30) * t;
          rot = 0 + m.midRot * t;
          scale = 0.05 + 0.65 * t;
        } else {
          const t = easeOutBack((lc - 0.4) / 0.6);
          dx = m.midDx + (m.dx - m.midDx) * t;
          dy = m.midDy + (m.dy - m.midDy) * t;
          rot = m.midRot + (m.rot - m.midRot) * t;
          scale = 0.7 + 0.3 * Math.min(1, t);
        }
        const op = Math.min(1, lc / 0.3);
        el.style.opacity = op.toFixed(3);
        el.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${scale.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
      });
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(updateStream);
    }
    setTimeout(updateStream, 100);

    // HOW section step progression
    const howSteps = Array.from(document.querySelectorAll<HTMLElement>("#howSteps .how-step"));
    const storyPanels = Array.from(document.querySelectorAll<HTMLElement>("#storyStage .story-panel"));
    let lastStep = -1;
    function applyHowStep(s: number) {
      const step = Math.min(2, Math.max(0, Math.floor(s * 3)));
      if (step === lastStep) return;
      lastStep = step;
      howSteps.forEach((el, i) => el.classList.toggle("active", i === step));
      storyPanels.forEach((el, i) => el.classList.toggle("show", i === step));
    }

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateProgress();
        updateStream();
        if (!howSection) {
          ticking = false;
          return;
        }
        const howRect = howSection.getBoundingClientRect();
        const winH = window.innerHeight;
        if (howRect.top < winH && howRect.bottom > 0) {
          applyHowStep(getSectionProgress(howSection));
        }
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    counterDots?.forEach((d) => {
      d.addEventListener("click", () => {
        const target = document.getElementById(d.dataset.target ?? "");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      io.disconnect();
      cardIO.disconnect();
    };
  }, []);

  return (
    <div className="kieio-marketing">
      <style>{MARKETING_CSS}</style>

      <div className="progress-track">
        <div className="progress-bar" ref={progressRef} />
      </div>

      <nav className="nav" ref={navRef}>
        <a href="#hero" className="brand">
          <span className="k-mark">(o)</span>
          <span className="k-word">KIEIO</span>
        </a>
        <div className="nav-links">
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
          {authedUser ? (
            <a href={APP_LIBRARY} className="nav-cta" title={authedUser.displayName ?? undefined}>
              {lang === "en"
                ? `Open app${authedUser.displayName ? ` · ${authedUser.displayName}` : ""} →`
                : lang === "zhHans"
                  ? `打开应用${authedUser.displayName ? ` · ${authedUser.displayName}` : ""} →`
                  : `打開應用${authedUser.displayName ? ` · ${authedUser.displayName}` : ""} →`}
            </a>
          ) : (
            <a href={APP_LOGIN} className="nav-cta">
              {nav.begin}
            </a>
          )}
        </div>
      </nav>

      <div className="counter" ref={counterRef}>
        {SECTIONS.map((id, i) => (
          <button
            key={id}
            type="button"
            className={"counter-dot" + (i === 0 ? " active" : "")}
            data-target={id}
            title={id}
            aria-label={`Jump to ${id}`}
          />
        ))}
      </div>

      {/* HERO */}
      <section className="pin-section hero" id="hero" data-section="hero">
        <div className="sticky">
          <div className="pin-inner">
            <div className="hero-grid">
              <div className="hero-left">
                <div className="eyebrow">
                  <span className="dot" />
                  {hero.eyebrow}
                </div>
                <h1>
                  {hero.titleLine1}
                  <br />
                  {hero.titleLine2Pre}
                  <span className="accent">{hero.titleAccent}</span>
                  {hero.titleSuffix}
                </h1>
                <div className="zh-tag">
                  {hero.zhTagLine1}
                  <br />
                  {hero.zhTagLine2Pre}
                  <span className="pop">{hero.zhTagPop}</span>
                  {hero.zhTagLine2Post}
                </div>
                <p className="sub">{hero.sub}</p>
                <div className="ctas">
                  <a href={APP_LOGIN} className="btn-primary">
                    {hero.ctaPrimary}
                  </a>
                  <a href="#how" className="btn-secondary">
                    {hero.ctaSecondary}
                  </a>
                </div>
                <div className="meta">
                  <span>{hero.meta1}</span>
                  <span>{hero.meta2}</span>
                  <span>{hero.meta3}</span>
                </div>
              </div>
              <div className="hero-right">
                <div className="hero-preview">
                  <div className="hero-preview-bar">
                    <div className="tabs">
                      <span className="tab" />
                      <span className="tab active" />
                      <span className="tab" />
                    </div>
                    <div className="title">{hero.previewTitle}</div>
                    <div className="turn">{hero.previewTurn}</div>
                  </div>
                  <div className="hero-preview-body">
                    <div className="msg m1">
                      <div className="who narrator">{hero.chat.m1Who}</div>
                      <div className="text">
                        {hero.chat.m1Text}
                        <br />
                        {hero.chat.m1Quote}
                        <span className="em">{hero.chat.m1QuoteEm}</span>
                        {hero.chat.m1QuotePost}
                      </div>
                    </div>
                    <div className="msg you m2">
                      <div className="who you">{hero.chat.m2Who}</div>
                      <div className="text">{hero.chat.m2Text}</div>
                    </div>
                    <div className="msg m3">
                      <div className="who narrator">{hero.chat.m3Who}</div>
                      <div className="text">{hero.chat.m3Text}</div>
                      <div className="msg-mem">
                        <span className="pulse" />
                        {hero.chat.m3Mem}
                      </div>
                    </div>
                    <div className="msg m4">
                      <div className="who narrator">{hero.chat.m4Who}</div>
                      <div className="text italic-mist">{hero.chat.m4Text}</div>
                    </div>
                  </div>
                  <div className="hero-preview-input">
                    <span className="prompt-glyph">&gt;</span>
                    <span>{hero.previewInputHint}</span>
                    <span className="caret" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="scroll-hint">{misc.scroll}</div>
        </div>
      </section>

      {/* STORIES STREAM */}
      <section className="pin-section stream" id="portal" data-section="portal" ref={streamSectionRef}>
        <div className="sticky">
          <div className="stream-header">
            <div className="eyebrow">
              <span className="dot" />
              {stream.eyebrow}
            </div>
            <h2>
              {stream.titleLine1}
              <br />
              <span className="accent">{stream.titleAccent}</span>
            </h2>
            <div className="sub">{stream.sub}</div>
          </div>
          <div className="stream-scene">
            <div className="stream-stage" ref={stageRef}>
              <div className="folder-anchor" ref={folderAnchorRef}>
                <div className="folder" ref={folderRef}>
                  <div className="folder-glow" />
                  <div className="folder-back" />
                  <div className="folder-tab" />
                  <div className="folder-front" />
                </div>
                <div className="folder-label">
                  {stream.folderLabelEn}
                  <span className="zh">{stream.folderLabelZh}</span>
                </div>
              </div>
              <svg className="cursor" viewBox="0 0 24 30" style={{ left: "80%", top: "20%" }} ref={cursorRef}>
                <path
                  d="M2 2 L2 24 L8 18 L11 26 L14 25 L11 17 L20 17 Z"
                  fill="#fff"
                  stroke="#0f0f11"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
              {STORIES.map((s, i) => (
                <div key={i} className={`poster art-${s.art}`}>
                  <div className="art" />
                  <div className="scrim" />
                  <div className="top-row">
                    <span className={"badge" + (s.live ? " live" : "")}>
                      {s.tag}
                      {s.live ? " · Live" : ""}
                    </span>
                    <span className="rating">{s.rating}</span>
                  </div>
                  <div className="meta-row">
                    <div className="title-zh">{s.zh}</div>
                    <div className="title-en">{s.en}</div>
                    <div className="bar">
                      <span className="plays">{s.plays} plays</span>
                      <span>{s.turn}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="pin-section how" id="how" data-section="how" ref={howSectionRef}>
        <div className="sticky">
          <div className="pin-inner">
            <div className="how-grid">
              <div className="how-left">
                <div className="eyebrow">
                  <span className="dot" />
                  {how.eyebrow}
                </div>
                <h2>
                  {how.titleLine1}
                  <br />
                  {how.titleLine2}
                </h2>
                <p>{how.lead}</p>
                <ol className="how-steps" id="howSteps">
                  <li className="how-step active" data-step="0">
                    <span className="how-step-num">01</span>
                    <div>
                      <div className="how-step-body">{how.step1Title}</div>
                      <div className="how-step-detail">{how.step1Detail}</div>
                    </div>
                  </li>
                  <li className="how-step" data-step="1">
                    <span className="how-step-num">02</span>
                    <div>
                      <div className="how-step-body">{how.step2Title}</div>
                      <div className="how-step-detail">{how.step2Detail}</div>
                    </div>
                  </li>
                  <li className="how-step" data-step="2">
                    <span className="how-step-num">03</span>
                    <div>
                      <div className="how-step-body">{how.step3Title}</div>
                      <div className="how-step-detail">{how.step3Detail}</div>
                    </div>
                  </li>
                </ol>
              </div>
              <div className="how-right">
                <div className="story-stage" id="storyStage">
                  <div className="story-panel show" data-step="0">
                    <div className="story-tag">{how.panel1Tag}</div>
                    {how.panel1En && <div className="story-input user">{how.panel1En}</div>}
                    {how.panel1Zh && <div className="story-input user zh">{how.panel1Zh}</div>}
                  </div>
                  <div className="story-panel" data-step="1">
                    <div className="story-tag">{how.panel2Tag}</div>
                    {how.panel2En && <div className="story-narrate">{how.panel2En}</div>}
                    {how.panel2Zh && <div className="story-narrate small">{how.panel2Zh}</div>}
                  </div>
                  <div className="story-panel" data-step="2">
                    <div className="story-tag">{how.panel3Tag}</div>
                    <div className="story-narrate small">{how.panel3Narrate}</div>
                    <div className="story-choice">
                      <button type="button" className="choice-btn selected">
                        {how.panel3Choice1}
                      </button>
                      <button type="button" className="choice-btn">
                        {how.panel3Choice2}
                      </button>
                      <button type="button" className="choice-btn">
                        {how.panel3Choice3}
                      </button>
                    </div>
                    <div className="memory-chip">
                      <span className="pulse" />
                      {how.panel3Mem}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MEMORY */}
      <section className="memory" id="memory" data-section="memory">
        <div className="memory-inner">
          <div className="eyebrow">
            <span className="dot" />
            {memory.eyebrow}
          </div>
          <h2>
            {memory.titlePre}
            <span className="accent">{memory.titleAccent}</span>
            {memory.titleSuffix}
          </h2>
          <p className="memory-lede">{memory.lede}</p>
          <div className="memory-grid">
            <div className="memory-card">
              <div className="memory-card-tag">{memory.card1Tag}</div>
              <h3>{memory.card1Title}</h3>
              <p>{memory.card1Body}</p>
              <div className="turn">{memory.card1Turn}</div>
            </div>
            <div className="memory-card">
              <div className="memory-card-tag">{memory.card2Tag}</div>
              <h3>{memory.card2Title}</h3>
              <p>{memory.card2Body}</p>
              <div className="turn">{memory.card2Turn}</div>
            </div>
            <div className="memory-card">
              <div className="memory-card-tag">{memory.card3Tag}</div>
              <h3>{memory.card3Title}</h3>
              <p>{memory.card3Body}</p>
              <div className="turn">{memory.card3Turn}</div>
            </div>
            <div className="memory-card">
              <div className="memory-card-tag">{memory.card4Tag}</div>
              <h3>{memory.card4Title}</h3>
              <p>{memory.card4Body}</p>
              <div className="turn">{memory.card4Turn}</div>
            </div>
          </div>
        </div>
      </section>

      {/* AGENTS · NPC Inner Voices (Storyteller-tier marquee) */}
      <section className="agents" id="agents" data-section="agents">
        <div className="agents-inner">
          <div className="eyebrow">
            <span className="dot" />
            {agents.eyebrow}
          </div>
          <h2>
            {agents.titlePre}
            <span className="accent">{agents.titleAccent}</span>
            {agents.titleSuffix}
          </h2>
          <p className="agents-lede">{agents.lede}</p>
          <div className="agents-grid">
            <div className="agent-card">
              <div className="agent-card-who">{agents.card1Who}</div>
              <p className="agent-card-quote">{agents.card1Quote}</p>
              <div className="agent-card-tag">{agents.card1Tag}</div>
            </div>
            <div className="agent-card">
              <div className="agent-card-who">{agents.card2Who}</div>
              <p className="agent-card-quote">{agents.card2Quote}</p>
              <div className="agent-card-tag">{agents.card2Tag}</div>
            </div>
            <div className="agent-card">
              <div className="agent-card-who">{agents.card3Who}</div>
              <p className="agent-card-quote">{agents.card3Quote}</p>
              <div className="agent-card-tag">{agents.card3Tag}</div>
            </div>
          </div>
          <div className="agents-pills">
            <span className="agent-pill agent-pill-star">{agents.pillStoryteller}</span>
            <span className="agent-pill">{agents.pillParallel}</span>
            <span className="agent-pill">{agents.pillPrivate}</span>
          </div>
        </div>
      </section>

      {/* ADAPTIVE · per-story state panel */}
      <section className="adaptive" id="adaptive" data-section="adaptive">
        <div className="adaptive-inner">
          <div className="eyebrow">
            <span className="dot" />
            {adaptive.eyebrow}
          </div>
          <h2>
            {adaptive.titlePre}
            <span className="accent">{adaptive.titleAccent}</span>
            {adaptive.titleSuffix}
          </h2>
          <p className="adaptive-lede">{adaptive.lede}</p>
          <div className="adaptive-grid">
            <div className="adaptive-panel">
              <div className="adaptive-panel-tag">{adaptive.panel1Tag}</div>
              <ul>
                <li>{adaptive.panel1Field1}</li>
                <li>{adaptive.panel1Field2}</li>
                <li>{adaptive.panel1Field3}</li>
                <li>{adaptive.panel1Field4}</li>
                <li>{adaptive.panel1Field5}</li>
              </ul>
            </div>
            <div className="adaptive-panel">
              <div className="adaptive-panel-tag">{adaptive.panel2Tag}</div>
              <ul>
                <li>{adaptive.panel2Field1}</li>
                <li>{adaptive.panel2Field2}</li>
                <li>{adaptive.panel2Field3}</li>
                <li>{adaptive.panel2Field4}</li>
                <li>{adaptive.panel2Field5}</li>
              </ul>
            </div>
            <div className="adaptive-panel">
              <div className="adaptive-panel-tag">{adaptive.panel3Tag}</div>
              <ul>
                <li>{adaptive.panel3Field1}</li>
                <li>{adaptive.panel3Field2}</li>
                <li>{adaptive.panel3Field3}</li>
                <li>{adaptive.panel3Field4}</li>
                <li>{adaptive.panel3Field5}</li>
              </ul>
            </div>
          </div>
          <div className="adaptive-pills">
            <span className="adaptive-pill">{adaptive.pillAutoDesign}</span>
            <span className="adaptive-pill">{adaptive.pillPerStory}</span>
            <span className="adaptive-pill adaptive-pill-moat">{adaptive.pillMoat}</span>
          </div>
        </div>
      </section>

      {/* BILINGUAL */}
      <section className="bilingual" id="bilingual" data-section="bilingual">
        <div className="bilingual-inner">
          <div className="bilingual-grid">
            <div>
              <div className="en">{bilingual.eyebrow}</div>
              <h2>
                {bilingual.titlePre}
                <span className="pop">{bilingual.titlePop}</span>
                {bilingual.titleMid}
                <br />
                {bilingual.titleSuffix}
              </h2>
              <p>{bilingual.p1}</p>
              <p className="mt-3">{bilingual.p2}</p>
            </div>
            <div className="bilingual-side">
              <div className="stat-row">
                <span className="stat-num">{bilingual.stat1Num}</span>
                <span className="stat-label">{bilingual.stat1Label}</span>
              </div>
              <div className="stat-row">
                <span className="stat-num">{bilingual.stat2Num}</span>
                <span className="stat-label">{bilingual.stat2Label}</span>
              </div>
              <div className="stat-row">
                <span className="stat-num">{bilingual.stat3Num}</span>
                <span className="stat-label">{bilingual.stat3Label}</span>
              </div>
              <div className="stat-row">
                <span className="stat-num">{bilingual.stat4Num}</span>
                <span className="stat-label">{bilingual.stat4Label}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ADULT */}
      <section className="adult" id="adult" data-section="adult">
        <div className="adult-inner">
          <div className="eyebrow">
            <span className="dot" />
            {adult.eyebrow}
          </div>
          <h2>
            {adult.titleLine1}
            <br />
            {adult.titleLine2}
          </h2>
          <p>{adult.p}</p>
          {adult.zhSub && <div className="adult-zh">{adult.zhSub}</div>}
          <div className="adult-pills">
            <span className="adult-pill">
              <span className="o">(o)</span>
              {adult.pill1}
            </span>
            <span className="adult-pill">
              <span className="o">(o)</span>
              {adult.pill2}
            </span>
            <span className="adult-pill">
              <span className="o">(o)</span>
              {adult.pill3}
            </span>
            <span className="adult-pill">
              <span className="o">(o)</span>
              {adult.pill4}
            </span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta" id="cta" data-section="cta">
        <div className="cta-inner">
          <div className="k-logo">
            <span className="k-mark">(o)</span>
            <span className="k-word">KIEIO</span>
          </div>
          <h2>
            {cta.titleLine1}
            <br />
            <span className="accent">{cta.titleAccent}</span>
            {cta.titleSuffix}
          </h2>
          <div className="lede">
            {cta.ledeLine1}
            {cta.ledeLine2 && (
              <>
                <br />
                {cta.ledeLine2}
              </>
            )}
          </div>
          <div className="cta-buttons">
            <a href={APP_LOGIN} className="btn-primary">
              {cta.ctaPrimary}
            </a>
            <a href={APP_LIBRARY} className="btn-secondary">
              {cta.ctaSecondary}
            </a>
          </div>
        </div>
      </section>

      <footer className="marketing-footer">
        <a href="#hero" className="brand">
          <span className="k-mark">(o)</span>
          <span className="k-word">KIEIO</span>
        </a>
        <div className="meta">© {new Date().getFullYear()} Kieio · kieio.com · /KEE-yo/</div>
      </footer>
    </div>
  );
}

// All CSS inlined to avoid creating a CSS module. The marketing landing is
// a single-purpose page; co-locating styles makes the port reversible if we
// later decide to redesign.
const MARKETING_CSS = `
.kieio-marketing {
  --bg: #0a0a0c;
  --bg-2: #131316;
  --bg-3: #18181c;
  --fg: #ffffff;
  --mist: rgba(255,255,255,0.62);
  --dim: rgba(255,255,255,0.38);
  --faint: rgba(255,255,255,0.14);
  --line: rgba(255,255,255,0.08);
  --purple: #552583;
  --purple-soft: #a78ad1;
  --purple-glow: rgba(85,37,131,0.45);
  background: var(--bg);
  color: var(--fg);
  font-family: 'Geist', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
.kieio-marketing * { box-sizing: border-box; }
.kieio-marketing ::selection { background: var(--purple); color: white; }

.kieio-marketing .k-mark { font-family: var(--font-gimbal), sans-serif; font-weight: 400; letter-spacing: -0.025em; line-height: 1; display: inline-block; }
.kieio-marketing .k-word { font-family: var(--font-termina), sans-serif; font-weight: 700; letter-spacing: -0.050em; line-height: 1; display: inline-block; }
.kieio-marketing .k-logo { display: inline-flex; align-items: center; gap: 0.4em; white-space: nowrap; }

.kieio-marketing .nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 100;
  padding: 18px 32px; display: flex; align-items: center; justify-content: space-between;
  background: transparent;
  transition: background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease;
  border-bottom: 1px solid transparent;
}
.kieio-marketing .nav.scrolled {
  background: rgba(10,10,12,0.85);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border-bottom-color: var(--line);
}
.kieio-marketing .nav .brand { display: inline-flex; align-items: center; gap: 0.4em; text-decoration: none; }
.kieio-marketing .nav .brand .k-mark { font-size: 28px; color: var(--purple); }
.kieio-marketing .nav .brand .k-word { font-size: 22px; color: var(--fg); }
.kieio-marketing .nav-links { display: flex; align-items: center; gap: 28px; font-size: 13px; color: var(--mist); }
.kieio-marketing .nav-links a { color: inherit; text-decoration: none; transition: color 0.2s; }
.kieio-marketing .nav-links a:hover { color: var(--fg); }
.kieio-marketing .nav-cta {
  padding: 9px 16px; background: var(--purple); color: white !important;
  border-radius: 4px; font-size: 12px; letter-spacing: 0.04em;
  font-weight: 600; text-decoration: none; transition: background 0.2s;
  font-family: 'Geist', sans-serif;
}
.kieio-marketing .nav-cta:hover { background: #6b3a9c; }
.kieio-marketing .locale-switch {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.08em;
}
.kieio-marketing .locale-switch a {
  color: var(--dim) !important; text-decoration: none;
  padding: 4px 2px; transition: color 0.2s;
}
.kieio-marketing .locale-switch a:hover { color: var(--mist) !important; }
.kieio-marketing .locale-switch .locale-active { color: var(--purple-soft) !important; font-weight: 600; }
.kieio-marketing .locale-switch .sep { color: var(--faint); padding: 0 2px; }

.kieio-marketing section { position: relative; }
.kieio-marketing .pin-section { position: relative; }
.kieio-marketing .pin-section .sticky {
  position: sticky; top: 0; height: 100vh; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
.kieio-marketing .pin-inner { width: 100%; max-width: 1240px; padding: 0 32px; }

.kieio-marketing .progress-track {
  position: fixed; top: 0; left: 0; height: 2px;
  width: 100%; z-index: 99; background: transparent; pointer-events: none;
}
.kieio-marketing .progress-bar { height: 100%; background: var(--purple); width: 0; transition: width 0.05s linear; }

.kieio-marketing .counter {
  position: fixed; right: 24px; top: 50%; transform: translateY(-50%);
  z-index: 50; display: flex; flex-direction: column; gap: 12px;
}
.kieio-marketing .counter-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--faint);
  transition: background 0.3s ease, transform 0.3s ease;
  cursor: pointer; padding: 0; border: 0;
}
.kieio-marketing .counter-dot.active { background: var(--purple); transform: scale(1.4); }
.kieio-marketing .counter-dot:hover { background: var(--purple-soft); }

.kieio-marketing .eyebrow {
  font-family: var(--font-geist-mono), 'JetBrains Mono', monospace; font-size: 11px;
  letter-spacing: 0.20em; text-transform: uppercase; color: var(--mist);
}
.kieio-marketing .eyebrow .dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--purple); margin-right: 10px; vertical-align: middle;
}

.kieio-marketing .hero { height: 200vh; overflow: clip; }
.kieio-marketing .hero .sticky {
  background:
    radial-gradient(60% 50% at 18% 30%, rgba(85,37,131,0.42), transparent 60%),
    radial-gradient(50% 40% at 80% 70%, rgba(85,37,131,0.20), transparent 60%);
}
.kieio-marketing .hero-grid {
  display: grid; grid-template-columns: 1.05fr 1fr; gap: 64px;
  align-items: center; width: 100%;
}
.kieio-marketing .hero-left > * { opacity: 0; transform: translateY(28px); transition: all 0.9s cubic-bezier(0.2, 0.8, 0.2, 1); }
.kieio-marketing .hero-left .eyebrow { transition-delay: 0.05s; }
.kieio-marketing .hero-left h1 { transition-delay: 0.20s; }
.kieio-marketing .hero-left .zh-tag { transition-delay: 0.35s; }
.kieio-marketing .hero-left .sub { transition-delay: 0.50s; }
.kieio-marketing .hero-left .ctas { transition-delay: 0.65s; }
.kieio-marketing .hero-left .meta { transition-delay: 0.80s; }
.kieio-marketing .hero.in-view .hero-left > * { opacity: 1; transform: translateY(0); }
.kieio-marketing .hero-left h1 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(40px, 5.6vw, 84px); letter-spacing: -0.050em;
  line-height: 1.0; text-transform: uppercase; margin: 18px 0 22px;
}
.kieio-marketing .hero-left h1 .accent { color: var(--purple-soft); }
.kieio-marketing .hero-left .zh-tag {
  font-family: 'Noto Sans TC', sans-serif; font-weight: 600;
  font-size: clamp(20px, 2.4vw, 30px); line-height: 1.4;
  color: var(--fg); margin-bottom: 24px;
}
.kieio-marketing .hero-left .zh-tag .pop { color: var(--purple-soft); }
.kieio-marketing .hero-left .sub {
  font-family: 'Geist', sans-serif; font-size: 16px; line-height: 1.7;
  color: var(--mist); max-width: 520px; margin-bottom: 36px;
}
.kieio-marketing .hero-left .ctas { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 32px; }
.kieio-marketing .hero-left .meta {
  display: flex; gap: 24px; flex-wrap: wrap;
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim);
}
.kieio-marketing .hero-left .meta span { display: inline-flex; align-items: center; gap: 8px; }
.kieio-marketing .hero-left .meta span::before {
  content: ''; width: 5px; height: 5px; border-radius: 50%;
  background: var(--purple-soft);
}

.kieio-marketing .hero-right {
  opacity: 0; transform: translateX(40px);
  transition: all 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.45s;
  perspective: 1200px;
}
.kieio-marketing .hero.in-view .hero-right { opacity: 1; transform: translateX(0); }
.kieio-marketing .hero-preview {
  background: rgba(19,19,22,0.85);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 22px 22px 18px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px var(--line) inset;
  backdrop-filter: blur(6px);
  transform: rotateX(2deg) rotateY(-2deg);
}
.kieio-marketing .hero-preview-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 14px; border-bottom: 1px solid var(--line); margin-bottom: 16px;
}
.kieio-marketing .hero-preview-bar .tabs { display: flex; gap: 6px; }
.kieio-marketing .hero-preview-bar .tab { width: 9px; height: 9px; border-radius: 50%; background: var(--faint); }
.kieio-marketing .hero-preview-bar .tab.active { background: var(--purple); }
.kieio-marketing .hero-preview-bar .title {
  font-family: var(--font-geist-mono), monospace; font-size: 10px;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--mist);
}
.kieio-marketing .hero-preview-bar .turn {
  font-family: var(--font-geist-mono), monospace; font-size: 10px;
  color: var(--dim); letter-spacing: 0.10em;
}
.kieio-marketing .hero-preview-body { display: flex; flex-direction: column; gap: 12px; min-height: 360px; }
.kieio-marketing .msg { display: flex; flex-direction: column; gap: 4px; opacity: 0; animation: msgIn 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
.kieio-marketing .hero.in-view .msg.m1 { animation-delay: 0.9s; }
.kieio-marketing .hero.in-view .msg.m2 { animation-delay: 1.5s; }
.kieio-marketing .hero.in-view .msg.m3 { animation-delay: 2.2s; }
.kieio-marketing .hero.in-view .msg.m4 { animation-delay: 3.0s; }
@keyframes msgIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.kieio-marketing .msg .who {
  font-family: var(--font-geist-mono), monospace; font-size: 10px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim);
}
.kieio-marketing .msg .who.narrator { color: var(--purple-soft); }
.kieio-marketing .msg .who.you { color: var(--mist); text-align: right; }
.kieio-marketing .msg .text {
  font-family: 'Noto Sans TC', sans-serif; font-size: 14px; line-height: 1.7; color: var(--fg);
}
.kieio-marketing .msg .text.italic-mist { font-style: italic; color: var(--mist); }
.kieio-marketing .msg.you .text {
  align-self: flex-end; background: rgba(85,37,131,0.18);
  border: 1px solid rgba(85,37,131,0.45); border-radius: 10px;
  padding: 8px 14px; max-width: 80%;
}
.kieio-marketing .msg .text .em { color: var(--purple-soft); font-style: normal; }
.kieio-marketing .msg-mem {
  display: inline-flex; align-items: center; gap: 8px;
  align-self: flex-start;
  padding: 6px 10px; margin-top: 2px;
  background: rgba(85,37,131,0.08);
  border: 1px solid rgba(85,37,131,0.30); border-radius: 100px;
  font-family: var(--font-geist-mono), monospace; font-size: 10px;
  letter-spacing: 0.10em; color: var(--purple-soft);
}
.kieio-marketing .msg-mem .pulse {
  width: 5px; height: 5px; border-radius: 50%; background: var(--purple);
  animation: kieio-pulse 1.6s ease-in-out infinite;
}
.kieio-marketing .hero-preview-input {
  margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line);
  display: flex; align-items: center; gap: 10px;
  font-family: 'Geist', sans-serif; font-size: 13px; color: var(--dim);
}
.kieio-marketing .hero-preview-input .prompt-glyph {
  color: var(--purple-soft); font-family: var(--font-geist-mono), monospace; font-size: 11px; letter-spacing: 0.10em;
}
.kieio-marketing .hero-preview-input .caret {
  display: inline-block; width: 1px; height: 14px; background: var(--purple-soft);
  animation: caret 1.1s steps(2) infinite;
}
@keyframes caret { 50% { opacity: 0; } }

.kieio-marketing .scroll-hint {
  position: absolute; bottom: 48px; left: 50%; transform: translateX(-50%);
  font-family: var(--font-geist-mono), monospace; font-size: 10px;
  letter-spacing: 0.20em; text-transform: uppercase; color: var(--dim);
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.kieio-marketing .scroll-hint::after {
  content: ''; width: 1px; height: 36px;
  background: linear-gradient(to bottom, var(--purple-soft), transparent);
  animation: scrollHint 2s ease-in-out infinite;
}
@keyframes scrollHint {
  0%, 100% { transform: scaleY(0); transform-origin: top; }
  50% { transform: scaleY(1); transform-origin: top; }
}

.kieio-marketing .stream { height: 500vh; }
.kieio-marketing .stream .sticky {
  background: radial-gradient(50% 50% at 50% 60%, rgba(85,37,131,0.20), transparent 70%);
}
.kieio-marketing .stream-header {
  position: absolute; top: 0; left: 0; right: 0; z-index: 5;
  padding: 80px 32px 0; text-align: center; pointer-events: none;
}
.kieio-marketing .stream-header h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(32px, 5vw, 64px); letter-spacing: -0.050em;
  line-height: 1; text-transform: uppercase; margin: 14px 0;
}
.kieio-marketing .stream-header h2 .accent { color: var(--purple-soft); }
.kieio-marketing .stream-header .sub {
  font-family: 'Noto Sans TC', sans-serif; font-size: 15px;
  color: var(--mist); letter-spacing: 0.04em;
}
.kieio-marketing .stream-scene { position: absolute; inset: 0; overflow: hidden; }
.kieio-marketing .stream-stage { position: absolute; inset: 0; pointer-events: none; }

.kieio-marketing .folder-anchor {
  position: absolute; left: 50%; top: 56%; transform: translate(-50%, -50%);
  will-change: transform, opacity;
}
.kieio-marketing .folder {
  position: relative; width: 180px; height: 130px;
  transform-origin: 50% 100%;
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.kieio-marketing .folder.click-pulse { animation: folderClick 0.5s cubic-bezier(0.2, 0.8, 0.2, 1); }
@keyframes folderClick { 0% { transform: scale(1); } 40% { transform: scale(0.94); } 100% { transform: scale(1); } }
.kieio-marketing .folder-tab {
  position: absolute; left: 0; top: 0; width: 80px; height: 22px;
  background: linear-gradient(180deg, #6b3a9c, #552583);
  border-radius: 8px 14px 0 0;
  box-shadow: 0 -1px 0 rgba(255,255,255,0.10) inset;
}
.kieio-marketing .folder-back {
  position: absolute; inset: 18px 0 0 0;
  background: linear-gradient(180deg, #3d1a60 0%, #2a1240 100%);
  border-radius: 4px 14px 14px 14px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(0,0,0,0.4);
}
.kieio-marketing .folder-front {
  position: absolute; inset: 38px 0 0 0;
  background: linear-gradient(180deg, #c7b8ff 0%, #a78ad1 50%, #6b3a9c 100%);
  border-radius: 4px 4px 14px 14px;
  box-shadow: 0 1px 0 rgba(255,255,255,0.30) inset, 0 -8px 24px rgba(0,0,0,0.4);
  transform-origin: 50% 100%;
  transition: transform 0.4s cubic-bezier(0.4, 0.0, 0.2, 1);
}
.kieio-marketing .folder.open .folder-front { transform: rotateX(-50deg) translateY(-6px); }
.kieio-marketing .folder-glow {
  position: absolute; inset: -40px; border-radius: 50%;
  background: radial-gradient(circle, rgba(199,184,255,0.45), transparent 60%);
  filter: blur(20px); opacity: 0; transition: opacity 0.5s ease;
}
.kieio-marketing .folder.open .folder-glow { opacity: 1; }
.kieio-marketing .folder-label {
  position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  margin-top: 18px;
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.20em; text-transform: uppercase; color: var(--mist);
  white-space: nowrap; text-align: center;
}
.kieio-marketing .folder-label .zh {
  display: block; margin-top: 4px;
  font-family: 'Noto Sans TC', sans-serif; font-size: 13px;
  letter-spacing: 0.04em; color: var(--fg); font-weight: 500;
}
.kieio-marketing .cursor {
  position: absolute; width: 24px; height: 30px;
  pointer-events: none; z-index: 20;
  will-change: transform;
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6));
}
.kieio-marketing .poster {
  position: absolute; left: 50%; top: 56%;
  width: 200px; height: 286px;
  margin-left: -100px; margin-top: -143px;
  border-radius: 14px; overflow: hidden;
  will-change: transform, opacity; pointer-events: auto;
  box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06) inset;
  transition: box-shadow 0.3s ease;
}
.kieio-marketing .poster .art { position: absolute; inset: 0; background-size: cover; background-position: center; }
.kieio-marketing .poster .scrim {
  position: absolute; inset: 0;
  background: linear-gradient(to top, rgba(10,10,12,0.92) 0%, rgba(10,10,12,0.50) 40%, rgba(10,10,12,0.0) 75%);
}
.kieio-marketing .poster .top-row {
  position: absolute; top: 10px; left: 10px; right: 10px;
  display: flex; justify-content: space-between; align-items: flex-start;
}
.kieio-marketing .poster .badge {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: 4px 7px; border-radius: 100px;
  font-family: var(--font-geist-mono), monospace; font-size: 8px;
  letter-spacing: 0.16em; text-transform: uppercase; color: #fff;
  border: 1px solid rgba(255,255,255,0.18);
}
.kieio-marketing .poster .badge.live { color: var(--purple-soft); border-color: rgba(199,184,255,0.45); }
.kieio-marketing .poster .badge.live::before {
  content: ''; width: 4px; height: 4px; border-radius: 50%; background: var(--purple-soft);
  animation: kieio-pulse 1.6s ease-in-out infinite;
}
.kieio-marketing .poster .rating {
  background: rgba(85,37,131,0.85); color: #fff; padding: 4px 7px; border-radius: 100px;
  font-family: var(--font-termina), sans-serif; font-weight: 700; font-size: 9px;
  letter-spacing: -0.020em;
}
.kieio-marketing .poster .meta-row { position: absolute; left: 14px; right: 14px; bottom: 12px; }
.kieio-marketing .poster .meta-row .title-zh {
  font-family: 'Noto Sans TC', sans-serif; font-weight: 700;
  font-size: 18px; line-height: 1.15; color: #fff;
  text-shadow: 0 2px 6px rgba(0,0,0,0.6);
}
.kieio-marketing .poster .meta-row .title-en {
  margin-top: 3px;
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: 9px; letter-spacing: -0.020em; text-transform: uppercase;
  color: rgba(255,255,255,0.65);
}
.kieio-marketing .poster .meta-row .bar {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 10px;
  font-family: var(--font-geist-mono), monospace; font-size: 8px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: rgba(255,255,255,0.55);
}
.kieio-marketing .poster .meta-row .bar .plays { color: var(--purple-soft); }

.kieio-marketing .poster.art-1 .art { background: linear-gradient(140deg, #2a1338 0%, #552583 40%, #c2185b 100%); }
.kieio-marketing .poster.art-2 .art { background: linear-gradient(160deg, #0e2030 0%, #1a3a52 50%, #4a6a85 100%); }
.kieio-marketing .poster.art-3 .art { background: linear-gradient(135deg, #1a0a2e 0%, #3d1a60 40%, #6b3a9c 100%); }
.kieio-marketing .poster.art-4 .art { background: linear-gradient(180deg, #3a1010 0%, #6e1a1a 50%, #1a0808 100%); }
.kieio-marketing .poster.art-5 .art { background: linear-gradient(120deg, #0a1a2e 0%, #1a3a5a 50%, #7edbff 110%); }
.kieio-marketing .poster.art-6 .art { background: linear-gradient(160deg, #2a1a30 0%, #6b3a6c 50%, #ffb6e8 130%); }
.kieio-marketing .poster.art-7 .art { background: linear-gradient(135deg, #1f1a0d 0%, #5a4a2a 50%, #c8a060 110%); }
.kieio-marketing .poster.art-8 .art { background: linear-gradient(125deg, #0a0f1f 0%, #3d2a6f 50%, #c7b8ff 110%); }
.kieio-marketing .poster.art-9 .art { background: linear-gradient(140deg, #1a0a0a 0%, #3a0a1a 50%, #6a1a2a 100%); }
.kieio-marketing .poster.art-10 .art { background: linear-gradient(160deg, #050a18 0%, #0f1f3a 50%, #2a4a78 110%); }
.kieio-marketing .poster.art-11 .art { background: linear-gradient(135deg, #1f0a1a 0%, #3a1a3a 50%, #6a3a5a 100%); }
.kieio-marketing .poster.art-12 .art { background: linear-gradient(150deg, #1a0a1a 0%, #4a1a3a 50%, #8a3a6a 100%); }
.kieio-marketing .poster .art::after {
  content: ''; position: absolute; inset: 0;
  background-image: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.15) 0, transparent 35%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.30) 0, transparent 45%);
  pointer-events: none;
}

.kieio-marketing .how { height: 400vh; }
.kieio-marketing .how .sticky { background: var(--bg); }
.kieio-marketing .how-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 80px; align-items: center; width: 100%; }
.kieio-marketing .how-left h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(28px, 4vw, 56px); letter-spacing: -0.050em; line-height: 1.05;
  text-transform: uppercase; margin: 16px 0 28px;
}
.kieio-marketing .how-left p { font-size: 16px; line-height: 1.65; color: var(--mist); max-width: 480px; }
.kieio-marketing .how-steps { list-style: none; counter-reset: step; margin-top: 40px; padding: 0; }
.kieio-marketing .how-step {
  display: flex; align-items: flex-start; gap: 24px;
  padding: 24px 0; border-top: 1px solid var(--line);
  opacity: 0.35; transition: opacity 0.4s ease;
}
.kieio-marketing .how-step.active { opacity: 1; }
.kieio-marketing .how-step:last-child { border-bottom: 1px solid var(--line); }
.kieio-marketing .how-step-num {
  font-family: var(--font-termina), sans-serif; font-weight: 700; font-size: 28px;
  letter-spacing: -0.025em; color: var(--purple-soft);
  width: 56px; flex-shrink: 0;
}
.kieio-marketing .how-step.active .how-step-num { color: var(--purple); }
.kieio-marketing .how-step-body {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: 22px; letter-spacing: -0.040em; line-height: 1.2;
  text-transform: uppercase;
}
.kieio-marketing .how-step-detail {
  margin-top: 8px; font-family: 'Geist', sans-serif; font-weight: 400;
  font-size: 14px; letter-spacing: 0; line-height: 1.6; color: var(--mist);
  text-transform: none;
}
.kieio-marketing .how-right {
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 12px;
  padding: 32px; min-height: 480px; position: relative; overflow: hidden;
}
.kieio-marketing .story-stage { position: relative; height: 480px; }
.kieio-marketing .story-panel {
  position: absolute; inset: 0; opacity: 0; transform: translateY(20px);
  transition: opacity 0.6s ease, transform 0.6s ease;
  display: flex; flex-direction: column; gap: 14px;
}
.kieio-marketing .story-panel.show { opacity: 1; transform: translateY(0); }
.kieio-marketing .story-tag {
  align-self: flex-start;
  font-family: var(--font-geist-mono), monospace; font-size: 10px;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--purple-soft); padding: 5px 10px;
  border: 1px solid var(--purple); border-radius: 100px;
}
.kieio-marketing .story-input {
  background: var(--bg); border: 1px solid var(--line); border-radius: 8px;
  padding: 18px 20px; font-family: 'Geist', sans-serif; font-size: 15px;
  color: var(--fg); line-height: 1.5;
}
.kieio-marketing .story-input.user { border-color: var(--purple); }
.kieio-marketing .story-input.zh { margin-top: -6px; font-family: 'Noto Sans TC', sans-serif; }
.kieio-marketing .story-narrate {
  font-family: 'Noto Sans TC', sans-serif; font-size: 16px;
  color: var(--fg); line-height: 1.85; padding: 14px 0;
}
.kieio-marketing .story-narrate.small { font-size: 14px; color: var(--mist); }
.kieio-marketing .story-choice { display: flex; flex-direction: column; gap: 8px; }
.kieio-marketing .choice-btn {
  text-align: left; padding: 12px 16px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
  color: var(--fg); font-family: 'Geist', sans-serif; font-size: 14px;
  line-height: 1.4; transition: all 0.2s; cursor: pointer;
}
.kieio-marketing .choice-btn:hover { border-color: var(--purple); background: rgba(85,37,131,0.08); }
.kieio-marketing .choice-btn.selected { border-color: var(--purple); background: rgba(85,37,131,0.15); color: var(--purple-soft); }
.kieio-marketing .memory-chip {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; background: rgba(85,37,131,0.08);
  border: 1px solid rgba(85,37,131,0.35); border-radius: 6px;
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  color: var(--purple-soft); letter-spacing: 0.04em;
}
.kieio-marketing .memory-chip .pulse {
  width: 6px; height: 6px; border-radius: 50%; background: var(--purple);
  animation: kieio-pulse 1.6s ease-in-out infinite;
}
@keyframes kieio-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--purple-glow); }
  50% { box-shadow: 0 0 0 6px transparent; }
}

.kieio-marketing .memory { padding: 160px 32px; }
.kieio-marketing .memory-inner { max-width: 1240px; margin: 0 auto; }
.kieio-marketing .memory h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(36px, 6vw, 84px); letter-spacing: -0.050em; line-height: 1;
  text-transform: uppercase; margin: 18px 0 28px;
}
.kieio-marketing .memory h2 .accent { color: var(--purple-soft); }
.kieio-marketing .memory-lede {
  font-family: 'Noto Sans TC', sans-serif; font-size: 17px; line-height: 1.7;
  color: var(--mist); max-width: 580px;
}
/* Wave 2 + new selling-point sections (2026-05-28): grid switched 3-col → 2-col
   to fit 4 memory cards (added Layer 04 · Lorebook). Mobile stays 1-col. */
.kieio-marketing .memory-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 80px; }
.kieio-marketing .memory-card {
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 12px;
  padding: 32px 28px; transition: all 0.6s ease; opacity: 0; transform: translateY(40px);
}
.kieio-marketing .memory-card.in-view { opacity: 1; transform: translateY(0); }
.kieio-marketing .memory-card:nth-child(2) { transition-delay: 0.15s; }
.kieio-marketing .memory-card:nth-child(3) { transition-delay: 0.3s; }
.kieio-marketing .memory-card:nth-child(4) { transition-delay: 0.45s; }
.kieio-marketing .memory-card-tag {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.18em; text-transform: uppercase; color: var(--purple-soft);
}
.kieio-marketing .memory-card h3 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: 26px; letter-spacing: -0.040em; line-height: 1.1;
  text-transform: uppercase; margin: 14px 0 18px;
}
.kieio-marketing .memory-card p {
  font-family: 'Geist', sans-serif; font-size: 14px; line-height: 1.65; color: var(--mist);
}
.kieio-marketing .memory-card .turn {
  margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line);
  font-family: var(--font-geist-mono), monospace; font-size: 11px; color: var(--dim);
  letter-spacing: 0.10em;
}

/* AGENTS · NPC Inner Voices (Storyteller-tier marquee · 2026-05-28) */
.kieio-marketing .agents { padding: 160px 32px; background: var(--bg); position: relative; overflow: hidden; }
.kieio-marketing .agents::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(40% 50% at 70% 40%, rgba(85,37,131,0.18), transparent 60%);
  pointer-events: none;
}
.kieio-marketing .agents-inner { max-width: 1240px; margin: 0 auto; position: relative; }
.kieio-marketing .agents h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(48px, 6vw, 88px); letter-spacing: -0.045em; line-height: 0.95;
  text-transform: uppercase; margin-top: 18px; max-width: 920px;
}
.kieio-marketing .agents h2 .accent {
  background: linear-gradient(135deg, var(--purple), var(--purple-soft));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.kieio-marketing .agents-lede {
  font-family: 'Noto Sans TC', sans-serif; font-size: 17px; line-height: 1.7;
  color: var(--mist); max-width: 720px; margin-top: 28px;
}
.kieio-marketing .agents-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 72px;
}
.kieio-marketing .agent-card {
  background: var(--bg-2); border: 1px solid var(--line); border-radius: 12px;
  padding: 28px 26px; position: relative;
}
.kieio-marketing .agent-card::before {
  content: ''; position: absolute; left: 0; top: 28px; bottom: 28px; width: 2px;
  background: var(--purple); border-radius: 2px;
}
.kieio-marketing .agent-card-who {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--purple-soft);
}
.kieio-marketing .agent-card-quote {
  font-family: 'Noto Sans TC', sans-serif; font-size: 15px; line-height: 1.7;
  /* Session 16 audit LOW-03 fix: --cream is undefined (inherited from a never-shipped palette).
   * Use --fg (white) which is the actual intended color for inside cards. */
  color: var(--fg); margin: 14px 0 18px;
}
.kieio-marketing .agent-card-tag {
  margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--line);
  font-family: var(--font-geist-mono), monospace; font-size: 10.5px;
  color: var(--dim); letter-spacing: 0.10em; text-transform: uppercase;
}
.kieio-marketing .agents-pills {
  display: flex; gap: 12px; margin-top: 48px; flex-wrap: wrap;
}
.kieio-marketing .agent-pill {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.12em; padding: 8px 14px; border-radius: 999px;
  background: var(--bg-2); border: 1px solid var(--line); color: var(--mist);
}
.kieio-marketing .agent-pill.agent-pill-star {
  background: linear-gradient(135deg, var(--purple), var(--purple-soft));
  color: #fff; border-color: transparent;
}

/* ADAPTIVE · per-story state panel (護城河 feature · 2026-05-28) */
.kieio-marketing .adaptive { padding: 160px 32px; background: var(--bg-2); position: relative; overflow: hidden; }
.kieio-marketing .adaptive::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(45% 50% at 25% 60%, rgba(244,215,122,0.10), transparent 60%);
  pointer-events: none;
}
.kieio-marketing .adaptive-inner { max-width: 1240px; margin: 0 auto; position: relative; }
.kieio-marketing .adaptive h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(48px, 6vw, 88px); letter-spacing: -0.045em; line-height: 0.95;
  text-transform: uppercase; margin-top: 18px; max-width: 920px;
}
.kieio-marketing .adaptive h2 .accent {
  background: linear-gradient(135deg, #f4d77a, var(--purple-soft));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.kieio-marketing .adaptive-lede {
  font-family: 'Noto Sans TC', sans-serif; font-size: 17px; line-height: 1.7;
  color: var(--mist); max-width: 720px; margin-top: 28px;
}
.kieio-marketing .adaptive-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 72px;
}
.kieio-marketing .adaptive-panel {
  background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  padding: 26px 24px;
}
.kieio-marketing .adaptive-panel-tag {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase; color: #f4d77a;
  padding-bottom: 16px; border-bottom: 1px solid var(--line);
}
.kieio-marketing .adaptive-panel ul {
  list-style: none; padding: 0; margin: 18px 0 0;
}
.kieio-marketing .adaptive-panel li {
  font-family: 'Noto Sans TC', sans-serif; font-size: 13.5px; color: var(--mist);
  padding: 10px 0; border-bottom: 1px dashed rgba(255,255,255,0.06);
  letter-spacing: -0.005em;
}
.kieio-marketing .adaptive-panel li:last-child { border-bottom: none; }
.kieio-marketing .adaptive-pills {
  display: flex; gap: 12px; margin-top: 48px; flex-wrap: wrap;
}
.kieio-marketing .adaptive-pill {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.12em; padding: 8px 14px; border-radius: 999px;
  background: var(--bg); border: 1px solid var(--line); color: var(--mist);
}
.kieio-marketing .adaptive-pill.adaptive-pill-moat {
  background: linear-gradient(135deg, #f4d77a, #d4a82a);
  color: #1a1410; border-color: transparent; font-weight: 600;
}

.kieio-marketing .bilingual { padding: 160px 32px; background: var(--bg-2); position: relative; overflow: hidden; }
.kieio-marketing .bilingual::before {
  content: ''; position: absolute; inset: 0;
  background: radial-gradient(50% 50% at 80% 50%, rgba(85,37,131,0.25), transparent 60%);
  pointer-events: none;
}
.kieio-marketing .bilingual-inner { max-width: 1240px; margin: 0 auto; position: relative; }
.kieio-marketing .bilingual-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: center; }
.kieio-marketing .bilingual h2 {
  font-family: 'Noto Sans TC', sans-serif; font-weight: 900;
  font-size: clamp(40px, 6vw, 88px); line-height: 1.0; margin-bottom: 24px;
}
.kieio-marketing .bilingual h2 .pop { color: var(--purple-soft); }
.kieio-marketing .bilingual .en {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: 18px; letter-spacing: -0.030em; text-transform: uppercase;
  color: var(--mist); margin-bottom: 24px;
}
.kieio-marketing .bilingual p {
  font-family: 'Noto Sans TC', sans-serif; font-size: 17px;
  line-height: 1.85; color: var(--mist);
}
.kieio-marketing .bilingual .mt-3 { margin-top: 18px; }
.kieio-marketing .bilingual-side {
  background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  padding: 36px; display: flex; flex-direction: column; gap: 18px;
}
.kieio-marketing .stat-row { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 0; border-bottom: 1px solid var(--line); }
.kieio-marketing .stat-row:last-child { border: 0; }
.kieio-marketing .stat-num { font-family: var(--font-termina), sans-serif; font-weight: 700; font-size: 36px; letter-spacing: -0.040em; color: var(--purple-soft); }
.kieio-marketing .stat-label { font-family: var(--font-geist-mono), monospace; font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--mist); text-align: right; }

.kieio-marketing .adult { padding: 160px 32px; }
.kieio-marketing .adult-inner { max-width: 980px; margin: 0 auto; text-align: center; }
.kieio-marketing .adult h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(32px, 5vw, 64px); letter-spacing: -0.050em; line-height: 1.05;
  text-transform: uppercase; margin: 18px 0 24px;
}
.kieio-marketing .adult p {
  font-family: 'Geist', sans-serif; font-size: 16px; line-height: 1.7;
  color: var(--mist); max-width: 640px; margin: 0 auto 16px;
}
.kieio-marketing .adult-zh {
  font-family: 'Noto Sans TC', sans-serif; font-size: 15px; color: var(--dim);
  line-height: 1.8; margin-top: 32px;
}
.kieio-marketing .adult-pills { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 40px; }
.kieio-marketing .adult-pill {
  padding: 10px 18px; border: 1px solid var(--line); border-radius: 100px;
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--mist);
}
.kieio-marketing .adult-pill .o { color: var(--purple-soft); margin-right: 6px; font-family: var(--font-gimbal), sans-serif; }

.kieio-marketing .cta {
  padding: 160px 32px; position: relative; overflow: hidden;
  background: radial-gradient(50% 50% at 50% 50%, rgba(85,37,131,0.35), transparent 70%);
}
.kieio-marketing .cta-inner { max-width: 980px; margin: 0 auto; text-align: center; }
.kieio-marketing .cta .k-logo { font-size: 80px; margin-bottom: 48px; }
.kieio-marketing .cta .k-mark { color: var(--purple); }
.kieio-marketing .cta h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(40px, 6vw, 88px); letter-spacing: -0.050em; line-height: 1.0;
  text-transform: uppercase; margin-bottom: 32px;
}
.kieio-marketing .cta h2 .accent { color: var(--purple-soft); }
.kieio-marketing .cta .lede {
  font-family: 'Noto Sans TC', sans-serif; font-size: 17px; color: var(--mist);
  margin-bottom: 48px;
}
.kieio-marketing .cta-buttons { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }

.kieio-marketing .btn-primary {
  background: var(--purple); color: white !important; border: 0;
  padding: 16px 32px; border-radius: 6px;
  font-family: 'Geist', sans-serif; font-size: 15px; font-weight: 600;
  letter-spacing: 0.02em; cursor: pointer;
  text-decoration: none; display: inline-block;
  transition: all 0.2s;
}
.kieio-marketing .btn-primary:hover { background: #6b3a9c; transform: translateY(-2px); box-shadow: 0 12px 32px var(--purple-glow); }
.kieio-marketing .btn-secondary {
  background: transparent; color: var(--fg) !important;
  border: 1px solid var(--faint); padding: 16px 32px; border-radius: 6px;
  font-family: 'Geist', sans-serif; font-size: 15px; font-weight: 500;
  cursor: pointer; text-decoration: none; display: inline-block; transition: all 0.2s;
}
.kieio-marketing .btn-secondary:hover { border-color: var(--fg); }

.kieio-marketing .marketing-footer {
  padding: 64px 32px 48px; border-top: 1px solid var(--line);
  display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 24px;
}
.kieio-marketing .marketing-footer .brand { display: inline-flex; align-items: center; gap: 0.4em; text-decoration: none; }
.kieio-marketing .marketing-footer .brand .k-mark { font-size: 22px; color: var(--purple); }
.kieio-marketing .marketing-footer .brand .k-word { font-size: 16px; color: var(--mist); }
.kieio-marketing .marketing-footer .meta {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--dim);
}

@media (max-width: 900px) {
  .kieio-marketing .how-grid { grid-template-columns: 1fr; gap: 40px; }
  .kieio-marketing .memory-grid { grid-template-columns: 1fr; }
  .kieio-marketing .agents-grid { grid-template-columns: 1fr; }
  .kieio-marketing .adaptive-grid { grid-template-columns: 1fr; }
  .kieio-marketing .bilingual-grid { grid-template-columns: 1fr; gap: 48px; }
  .kieio-marketing .counter { display: none; }
  .kieio-marketing .nav-links { display: none; }
  .kieio-marketing .hero-grid { grid-template-columns: 1fr; }
  .kieio-marketing .hero-right { display: none; }
}
`;
