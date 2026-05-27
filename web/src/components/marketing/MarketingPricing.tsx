"use client";

/**
 * Marketing pricing page · dark cinematic theme matching MarketingLanding.
 *
 * Receives all data from server-rendered /[locale]/pricing/page.tsx:
 *   - lang ('zh' or 'en')
 *   - isAuthed + currentTier + hasStripeCustomer + pendingCancel
 *   - searchParams (for ?canceled=1 toast)
 *
 * Renders 3-tier card grid (Free / Standard / Pro), top-up section preview,
 * FAQ-lite, and CTA. Reuses Subscribe logic via MarketingSubscribeButton.
 */

import { useEffect, useRef } from "react";
import { TIER_DISPLAY, TOPUP_DISPLAY, type PublicTier, type PaidTier } from "@/lib/stripe/products";
import { MarketingSubscribeButton } from "./MarketingSubscribeButton";
import { LOCALE_SWITCHER, type MarketingLang } from "./copy";

const APP_LOGIN_BASE = "https://app.kieio.com";

const PUBLIC_TIERS: PublicTier[] = ["free", "adventurer", "storyteller"];

const COPY = {
  en: {
    eyebrow: "Pricing",
    title: "Pick your",
    titleAccent: "story tempo",
    sub: "Free stays free. Upgrade for unlimited lives.",
    usdNotice: "Prices in USD · Stripe accepts HKD / TWD cards, Apple Pay, Google Pay",
    popular: "Most popular",
    perMonth: "/mo",
    ctaLogin: "Sign in to subscribe",
    ctaSubscribe: "Subscribe",
    ctaCurrent: "Your current plan",
    ctaPendingCancel: "Cancel scheduled · click to resume",
    ctaSwitch: "Switch to this plan",
    ctaManage: "Manage / cancel",
    freeStart: "Free with signup · no card",
    topupEyebrow: "One-time",
    topupTitle: "Or top up one-time",
    topupSub: "Don't want a subscription? Buy credits outright · use forever",
    topupFoot: "Purchase top-ups from Settings after signing in · Stripe secure checkout",
    faqEyebrow: "FAQ",
    faqTitle: "Questions",
    faqs: [
      { q: "Is the free tier actually free forever?", a: "Yes. 1,000 credits on signup + 50 credits refreshed daily. No card. No expiry. No trial." },
      { q: "What happens when credits run out?", a: "Wait for tomorrow's 50-credit refresh, top up one-time, or subscribe for more monthly credits." },
      { q: "Can I cancel anytime?", a: "Yes. From Settings → Manage subscription. You keep access until the end of your current period." },
      { q: "How do I unlock adult mode?", a: "Stripe Identity age verification (KYC) — one-time, permanent unlock. Off by default." },
      { q: "How do AI tiers work?", a: "Standard / Pro / Pro Max / Adult — auto-routed by your selected model. Free tier is Standard only." },
    ],
    canceledTitle: "Subscription canceled",
    canceledBody: "You weren't charged. Try again anytime.",
    ctaBottomTitle: "Begin your",
    ctaBottomAccent: "first life",
    ctaBottomSub: "The first story is always free.",
    ctaBottomBtn: "Begin →",
    ctaBottomBrowse: "Browse the library",
    backToHome: "← Back home",
    creditsLine: (n: number) => `${n.toLocaleString()} credits / month`,
    freeCreditsLine: "1,000 signup · 50 daily",
    navHow: "How it works",
    navMemory: "Memory",
    navPricing: "Pricing",
    navBegin: "Begin",
  },
  zhHant: {
    eyebrow: "Pricing · 訂價",
    title: "揀適合你嘅",
    titleAccent: "故事節奏",
    sub: "免費永遠係免費。要無限故事，先升級。",
    usdNotice: "USD 計價 · Stripe 結帳支援港幣 / 台幣 / 信用卡 / Apple Pay / Google Pay",
    popular: "最熱門",
    perMonth: "/月",
    ctaLogin: "登入後訂閱",
    ctaSubscribe: "立即訂閱",
    ctaCurrent: "你而家用緊呢個方案",
    ctaPendingCancel: "已預約取消 · 點擊續訂",
    ctaSwitch: "切換到呢個方案",
    ctaManage: "管理訂閱 / 取消",
    freeStart: "註冊就有 · 唔使卡",
    topupEyebrow: "一次性",
    topupTitle: "或者一次過充值",
    topupSub: "唔想訂閱？一次性買 credits · 用幾耐都得",
    topupFoot: "登入後喺 Settings 頁面充值 · Stripe 安全結帳",
    faqEyebrow: "常見問題",
    faqTitle: "常見問題",
    faqs: [
      { q: "Free tier 真係永遠免費？", a: "係 · 1,000 credits 註冊送 + 每日 50 credits 自動補。唔使信用卡 · 冇 expiry · 冇 trial。" },
      { q: "Credits 用完點算？", a: "等聽日 50 credits 補返 · 或者一次性買 top-up · 或者升級訂閱拎更多 monthly credits。" },
      { q: "可唔可以隨時取消？", a: "可以 · 任何時候喺 Settings → 管理訂閱裡面 cancel。當前 billing period 玩到完先停權。" },
      { q: "成人模式點解鎖？", a: "需要 Stripe Identity 年齡驗證 (KYC) · 一次過 · 永久解鎖。預設關閉。" },
      { q: "唔同 model 點揀？", a: "Standard / Pro / Pro Max / Adult 四個 tier · 自動按你揀嘅 model + content 路由。Free tier 限 Standard model。" },
    ],
    canceledTitle: "訂閱取消",
    canceledBody: "你冇 charge 到。隨時可以再試。",
    ctaBottomTitle: "開始你嘅",
    ctaBottomAccent: "第一段人生",
    ctaBottomSub: "第一段故事永遠係免費",
    ctaBottomBtn: "立即開始 →",
    ctaBottomBrowse: "睇下故事庫",
    backToHome: "← 返主頁",
    creditsLine: (n: number) => `每月 ${n.toLocaleString()} credits`,
    freeCreditsLine: "1,000 註冊送 · 每日 50",
    navHow: "點玩",
    navMemory: "記憶",
    navPricing: "訂價",
    navBegin: "立即開始",
  },
  zhHans: {
    eyebrow: "Pricing · 订价",
    title: "选适合你的",
    titleAccent: "故事节奏",
    sub: "免费永远是免费。想要无限故事，再升级。",
    usdNotice: "USD 计价 · Stripe 接受港币 / 台币 / 信用卡 / Apple Pay / Google Pay",
    popular: "最热门",
    perMonth: "/月",
    ctaLogin: "登入后订阅",
    ctaSubscribe: "立即订阅",
    ctaCurrent: "你正在用这个方案",
    ctaPendingCancel: "已预约取消 · 点击续订",
    ctaSwitch: "切换到这个方案",
    ctaManage: "管理订阅 / 取消",
    freeStart: "注册就有 · 不用卡",
    topupEyebrow: "一次性",
    topupTitle: "或者一次性充值",
    topupSub: "不想订阅？一次性买 credits · 用多久都行",
    topupFoot: "登入后在 Settings 页面充值 · Stripe 安全结账",
    faqEyebrow: "常见问题",
    faqTitle: "常见问题",
    faqs: [
      { q: "Free tier 真的永远免费？", a: "是 · 1,000 credits 注册送 + 每日 50 credits 自动补。不用信用卡 · 没有 expiry · 没有 trial。" },
      { q: "Credits 用完怎么办？", a: "等明天 50 credits 补回 · 或者一次性买 top-up · 或者升级订阅拿更多 monthly credits。" },
      { q: "可以随时取消吗？", a: "可以 · 任何时候在 Settings → 管理订阅里面 cancel。当前 billing period 玩到完才停权。" },
      { q: "成人模式怎么解锁？", a: "需要 Stripe Identity 年龄验证 (KYC) · 一次性 · 永久解锁。默认关闭。" },
      { q: "不同 model 怎么选？", a: "Standard / Pro / Pro Max / Adult 四个 tier · 自动按你选的 model + content 路由。Free tier 限 Standard model。" },
    ],
    canceledTitle: "订阅取消",
    canceledBody: "你没被 charge 到。随时可以再试。",
    ctaBottomTitle: "开始你的",
    ctaBottomAccent: "第一段人生",
    ctaBottomSub: "第一段故事永远免费",
    ctaBottomBtn: "立即开始 →",
    ctaBottomBrowse: "看故事库",
    backToHome: "← 返主页",
    creditsLine: (n: number) => `每月 ${n.toLocaleString()} credits`,
    freeCreditsLine: "1,000 注册送 · 每日 50",
    navHow: "怎么玩",
    navMemory: "记忆",
    navPricing: "订价",
    navBegin: "立即开始",
  },
};

export function MarketingPricing({
  lang,
  isAuthed,
  currentTier,
  hasStripeCustomer,
  pendingCancel,
  showCanceledToast,
  locale,
}: {
  lang: MarketingLang;
  isAuthed: boolean;
  currentTier: string | null;
  hasStripeCustomer: boolean;
  pendingCancel: boolean;
  showCanceledToast: boolean;
  locale: string;
}) {
  const navRef = useRef<HTMLElement>(null);

  // Sticky nav · transparent on top · solid after scroll (mirrors landing)
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    function onScroll() {
      nav?.classList.toggle("scrolled", window.scrollY > 50);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const c = COPY[lang];
  const appLogin = `${APP_LOGIN_BASE}/${locale}/login?next=/pricing`;
  const appLibrary = `${APP_LOGIN_BASE}/${locale}/library`;

  return (
    <div className="kieio-marketing">
      <style>{MARKETING_PRICING_CSS}</style>

      <nav className="nav" ref={navRef}>
        <a href={`/${locale}`} className="brand">
          <span className="k-mark">(o)</span>
          <span className="k-word">KIEIO</span>
        </a>
        <div className="nav-links">
          <a href={`/${locale}#how`}>{c.navHow}</a>
          <a href={`/${locale}#memory`}>{c.navMemory}</a>
          <a href={`/${locale}/pricing`} className="active">
            {c.navPricing}
          </a>
          <span className="locale-switch">
            {LOCALE_SWITCHER.map((l, i) => (
              <span key={l.locale}>
                {i > 0 && <span className="sep">·</span>}
                <a
                  href={`/${l.locale}/pricing`}
                  className={l.lang === lang ? "locale-active" : ""}
                  aria-current={l.lang === lang ? "page" : undefined}
                >
                  {l.label}
                </a>
              </span>
            ))}
          </span>
          <a href={appLogin} className="nav-cta">
            {c.navBegin}
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="pricing-hero">
        <div className="hero-bg" />
        <div className="hero-inner">
          <div className="eyebrow">
            <span className="dot" />
            {c.eyebrow}
          </div>
          <h1>
            {c.title}
            <br />
            <span className="accent">{c.titleAccent}</span>.
          </h1>
          <p className="sub">{c.sub}</p>
          <p className="usd">{c.usdNotice}</p>

          {showCanceledToast && (
            <div className="canceled-banner">
              <div className="canceled-title">{c.canceledTitle}</div>
              <div className="canceled-body">{c.canceledBody}</div>
            </div>
          )}
        </div>
      </section>

      {/* Tier cards */}
      <section className="tiers">
        <div className="tiers-inner">
          <div className="tier-grid">
            {PUBLIC_TIERS.map((tier) => (
              <TierCard
                key={tier}
                tier={tier}
                lang={lang}
                isAuthed={isAuthed}
                currentTier={currentTier}
                hasStripeCustomer={hasStripeCustomer}
                pendingCancel={pendingCancel}
                loginHref={appLogin}
                copy={c}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Top-up preview */}
      <section className="topup-section">
        <div className="topup-inner">
          <div className="eyebrow">
            <span className="dot" />
            {c.topupEyebrow}
          </div>
          <h2>{c.topupTitle}</h2>
          <p className="topup-sub">{c.topupSub}</p>
          <div className="topup-grid">
            {(["small", "medium", "large"] as const).map((pack) => {
              const d = TOPUP_DISPLAY[pack];
              return (
                <div key={pack} className={`topup-card ${pack === "large" ? "highlight" : ""}`}>
                  <div className="topup-name">{lang !== "en" ? d.nameZh : d.name}</div>
                  <div className="topup-price">${d.priceUsd.toFixed(0)}</div>
                  <div className="topup-credits">
                    {d.credits.toLocaleString()} credits
                    {d.bonusPct > 0 && <span className="topup-bonus"> · +{d.bonusPct}%</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="topup-foot">{c.topupFoot}</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq-section">
        <div className="faq-inner">
          <div className="eyebrow">
            <span className="dot" />
            {c.faqEyebrow}
          </div>
          <h2>{c.faqTitle}</h2>
          <div className="faq-list">
            {c.faqs.map((f, i) => (
              <details key={i} className="faq-item">
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bottom-cta">
        <div className="bottom-cta-inner">
          <div className="k-logo">
            <span className="k-mark">(o)</span>
            <span className="k-word">KIEIO</span>
          </div>
          <h2>
            {c.ctaBottomTitle}
            <br />
            <span className="accent">{c.ctaBottomAccent}</span>.
          </h2>
          <div className="lede">{c.ctaBottomSub}</div>
          <div className="cta-buttons">
            <a href={appLogin} className="btn-primary">
              {c.ctaBottomBtn}
            </a>
            <a href={appLibrary} className="btn-secondary">
              {c.ctaBottomBrowse}
            </a>
          </div>
        </div>
      </section>

      <footer className="marketing-footer">
        <a href="/" className="brand">
          <span className="k-mark">(o)</span>
          <span className="k-word">KIEIO</span>
        </a>
        <a href="/" className="back-home">
          {c.backToHome}
        </a>
        <div className="meta">© {new Date().getFullYear()} Kieio · kieio.com · /KEE-yo/</div>
      </footer>
    </div>
  );
}

function TierCard({
  tier,
  lang,
  isAuthed,
  currentTier,
  hasStripeCustomer,
  pendingCancel,
  loginHref,
  copy,
}: {
  tier: PublicTier;
  lang: MarketingLang;
  isAuthed: boolean;
  currentTier: string | null;
  hasStripeCustomer: boolean;
  pendingCancel: boolean;
  loginHref: string;
  copy: (typeof COPY)[MarketingLang];
}) {
  const d = TIER_DISPLAY[tier];
  const isPopular = tier === "storyteller";
  const isFree = tier === "free";
  const name = lang !== "en" ? d.publicNameZh : d.publicName;

  return (
    <div className={`tier-card ${isPopular ? "popular" : ""}`}>
      {isPopular && <div className="popular-badge">{copy.popular}</div>}
      <div className="tier-name">{name}</div>
      <div className="tier-price-row">
        <span className="tier-price">{isFree ? "$0" : `$${d.priceUsd.toFixed(2)}`}</span>
        {!isFree && <span className="tier-period">{copy.perMonth}</span>}
      </div>
      <div className="tier-credits">
        {isFree ? copy.freeCreditsLine : copy.creditsLine(d.monthlyCredits)}
      </div>
      <ul className="tier-bullets">
        {d.bullets.map((b) => (
          <li key={b.en}>
            <span className="check">✓</span>
            <span>{lang !== "en" ? b.zh : b.en}</span>
          </li>
        ))}
      </ul>
      <div className="tier-cta">
        {isFree ? (
          <a href={loginHref} className="mk-btn-outline">
            {copy.freeStart}
          </a>
        ) : (
          <MarketingSubscribeButton
            tier={tier as PaidTier}
            isAuthed={isAuthed}
            currentTier={currentTier}
            hasStripeCustomer={hasStripeCustomer}
            pendingCancel={pendingCancel}
            loginHref={loginHref}
            labelSubscribe={copy.ctaSubscribe}
            labelCurrent={copy.ctaCurrent}
            labelPendingCancel={copy.ctaPendingCancel}
            labelManage={copy.ctaManage}
            labelSwitch={copy.ctaSwitch}
            labelLogin={copy.ctaLogin}
          />
        )}
      </div>
    </div>
  );
}

const MARKETING_PRICING_CSS = `
@import url('https://fonts.googleapis.com/css?family=Google+Sans:wght@400;500;700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

.kieio-marketing {
  --font-num: 'Google Sans', 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
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
  background: var(--bg); color: var(--fg);
  font-family: 'Geist', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
.kieio-marketing * { box-sizing: border-box; }
.kieio-marketing ::selection { background: var(--purple); color: white; }

.kieio-marketing .k-mark { font-family: var(--font-gimbal), sans-serif; font-weight: 400; letter-spacing: -0.025em; line-height: 1; display: inline-block; }
.kieio-marketing .k-word { font-family: var(--font-termina), sans-serif; font-weight: 700; letter-spacing: -0.050em; line-height: 1; display: inline-block; }
.kieio-marketing .k-logo { display: inline-flex; align-items: center; gap: 0.4em; white-space: nowrap; }

/* Nav (same as landing) */
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
.kieio-marketing .nav-links a.active { color: var(--purple-soft); }
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

.kieio-marketing .eyebrow {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.20em; text-transform: uppercase; color: var(--mist);
}
.kieio-marketing .eyebrow .dot {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
  background: var(--purple); margin-right: 10px; vertical-align: middle;
}

/* Hero (pricing-specific · simpler than landing's hero) */
.kieio-marketing .pricing-hero { position: relative; padding: 160px 32px 80px; overflow: hidden; }
.kieio-marketing .pricing-hero .hero-bg {
  position: absolute; inset: 0;
  background:
    radial-gradient(60% 50% at 30% 30%, rgba(85,37,131,0.30), transparent 60%),
    radial-gradient(40% 40% at 75% 60%, rgba(85,37,131,0.18), transparent 60%);
  pointer-events: none;
}
.kieio-marketing .pricing-hero .hero-inner {
  position: relative; max-width: 920px; margin: 0 auto; text-align: center;
}
.kieio-marketing .pricing-hero h1 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(40px, 6vw, 80px); letter-spacing: -0.050em; line-height: 1.0;
  text-transform: uppercase; margin: 20px 0 28px;
}
.kieio-marketing .pricing-hero h1 .accent { color: var(--purple-soft); }
.kieio-marketing .pricing-hero .sub {
  font-family: 'Noto Sans TC', sans-serif; font-size: 18px; line-height: 1.6;
  color: var(--mist); margin: 0 auto 16px; max-width: 620px;
}
.kieio-marketing .pricing-hero .usd {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.12em; color: var(--dim); text-transform: uppercase;
  margin-top: 24px;
}
.kieio-marketing .canceled-banner {
  display: inline-block; margin-top: 32px; padding: 14px 22px;
  background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.35);
  border-radius: 8px; text-align: left;
}
.kieio-marketing .canceled-title {
  font-family: var(--font-termina), sans-serif; font-size: 13px;
  color: #fbbf24; letter-spacing: -0.020em; text-transform: uppercase;
}
.kieio-marketing .canceled-body {
  margin-top: 4px; font-family: 'Noto Sans TC', sans-serif; font-size: 13px;
  color: var(--mist);
}

/* Tier cards */
.kieio-marketing .tiers { padding: 0 32px 100px; }
.kieio-marketing .tiers-inner { max-width: 1180px; margin: 0 auto; }
.kieio-marketing .tier-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
}
.kieio-marketing .tier-card {
  position: relative;
  background: var(--bg-2); border: 1px solid var(--line);
  border-radius: 14px; padding: 32px 28px;
  display: flex; flex-direction: column;
  transition: border-color 0.3s ease, transform 0.3s ease;
}
.kieio-marketing .tier-card:hover { border-color: rgba(85,37,131,0.35); transform: translateY(-2px); }
.kieio-marketing .tier-card.popular {
  border-color: var(--purple);
  background: linear-gradient(180deg, rgba(85,37,131,0.10) 0%, var(--bg-2) 35%);
  box-shadow: 0 0 0 1px var(--purple), 0 30px 80px rgba(85,37,131,0.25);
  transform: scale(1.02);
}
.kieio-marketing .popular-badge {
  position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
  background: var(--purple); color: white;
  padding: 5px 14px; border-radius: 100px;
  font-family: var(--font-geist-mono), monospace; font-size: 10px;
  letter-spacing: 0.20em; text-transform: uppercase; font-weight: 600;
}
.kieio-marketing .tier-name {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: 22px; letter-spacing: -0.040em; line-height: 1; text-transform: uppercase;
  margin-bottom: 18px;
}
.kieio-marketing .tier-price-row { display: flex; align-items: baseline; gap: 4px; margin-bottom: 4px; }
.kieio-marketing .tier-price {
  font-family: var(--font-num); font-weight: 700;
  font-size: 48px; letter-spacing: -0.030em; line-height: 1;
  font-feature-settings: "tnum" 1, "lnum" 1;
}
.kieio-marketing .tier-period {
  font-family: var(--font-num); font-weight: 500; font-size: 14px;
  color: var(--mist); letter-spacing: 0; text-transform: lowercase;
}
.kieio-marketing .tier-credits {
  font-family: var(--font-num); font-size: 13px; color: var(--mist);
  font-feature-settings: "tnum" 1;
  margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--line);
}
.kieio-marketing .tier-bullets { list-style: none; padding: 0; margin: 0 0 28px; flex: 1; }
.kieio-marketing .tier-bullets li {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 10px 0; font-family: 'Noto Sans TC', sans-serif;
  font-size: 14px; color: var(--mist); line-height: 1.5;
}
.kieio-marketing .tier-bullets .check {
  color: var(--purple-soft); font-weight: 700; flex-shrink: 0; line-height: 1.5;
}
.kieio-marketing .tier-cta { margin-top: auto; }

/* Buttons (used by MarketingSubscribeButton + free CTA) */
.kieio-marketing .mk-btn-stack { display: flex; flex-direction: column; gap: 8px; }
.kieio-marketing .mk-btn-primary,
.kieio-marketing .mk-btn-outline,
.kieio-marketing .mk-btn-disabled {
  width: 100%; padding: 14px 20px; border-radius: 6px;
  font-family: 'Geist', sans-serif; font-size: 14px; font-weight: 600;
  letter-spacing: 0.02em; cursor: pointer; text-decoration: none;
  display: inline-flex; align-items: center; justify-content: center;
  transition: all 0.2s; border: 1px solid transparent;
  text-align: center;
}
.kieio-marketing .mk-btn-primary { background: var(--purple); color: white !important; }
.kieio-marketing .mk-btn-primary:hover:not(:disabled) {
  background: #6b3a9c; transform: translateY(-1px); box-shadow: 0 8px 24px var(--purple-glow);
}
.kieio-marketing .mk-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.kieio-marketing .mk-btn-outline {
  background: transparent; color: var(--fg) !important; border-color: var(--faint);
}
.kieio-marketing .mk-btn-outline:hover { border-color: var(--purple-soft); color: var(--purple-soft) !important; }
.kieio-marketing .mk-btn-disabled {
  background: var(--bg-3); color: var(--mist) !important;
  border-color: var(--line); cursor: not-allowed;
}
.kieio-marketing .mk-btn-link {
  background: none; border: 0; color: var(--mist);
  font-family: 'Geist', sans-serif; font-size: 12px; text-decoration: underline;
  cursor: pointer; padding: 4px;
}
.kieio-marketing .mk-btn-link:hover { color: var(--fg); }
.kieio-marketing .mk-err {
  font-family: 'Geist', sans-serif; font-size: 11px; color: #f87171; margin: 4px 0 0;
}

/* Top-up section */
.kieio-marketing .topup-section { padding: 80px 32px; background: var(--bg-2); }
.kieio-marketing .topup-inner { max-width: 1080px; margin: 0 auto; text-align: center; }
.kieio-marketing .topup-section h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(28px, 4vw, 48px); letter-spacing: -0.050em; line-height: 1.1;
  text-transform: uppercase; margin: 16px 0 12px;
}
.kieio-marketing .topup-sub {
  font-family: 'Noto Sans TC', sans-serif; font-size: 15px; color: var(--mist);
  margin-bottom: 40px;
}
.kieio-marketing .topup-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  max-width: 720px; margin: 0 auto 32px;
}
.kieio-marketing .topup-card {
  padding: 24px 20px; background: var(--bg); border: 1px solid var(--line);
  border-radius: 10px; text-align: center; transition: border-color 0.2s;
}
.kieio-marketing .topup-card:hover { border-color: rgba(85,37,131,0.4); }
.kieio-marketing .topup-card.highlight {
  border-color: var(--purple); background: linear-gradient(180deg, rgba(85,37,131,0.08), var(--bg));
}
.kieio-marketing .topup-name {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--purple-soft);
  margin-bottom: 8px;
}
.kieio-marketing .topup-price {
  font-family: var(--font-num); font-weight: 700;
  font-size: 36px; letter-spacing: -0.020em; line-height: 1;
  font-feature-settings: "tnum" 1, "lnum" 1;
}
.kieio-marketing .topup-credits {
  margin-top: 8px; font-family: var(--font-num); font-size: 13px;
  color: var(--mist); font-feature-settings: "tnum" 1;
}
.kieio-marketing .topup-bonus { color: var(--purple-soft); font-weight: 600; }
.kieio-marketing .topup-foot {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.12em; color: var(--dim); text-transform: uppercase;
}

/* FAQ */
.kieio-marketing .faq-section { padding: 100px 32px; }
.kieio-marketing .faq-inner { max-width: 820px; margin: 0 auto; }
.kieio-marketing .faq-section h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(28px, 4vw, 48px); letter-spacing: -0.050em; line-height: 1.1;
  text-transform: uppercase; margin: 16px 0 40px;
}
.kieio-marketing .faq-list { display: flex; flex-direction: column; gap: 4px; }
.kieio-marketing .faq-item {
  border-bottom: 1px solid var(--line);
  padding: 20px 0;
}
.kieio-marketing .faq-item summary {
  cursor: pointer; list-style: none;
  display: flex; justify-content: space-between; align-items: center;
  font-family: 'Noto Sans TC', sans-serif; font-size: 16px; font-weight: 500;
  color: var(--fg); padding-right: 8px;
}
.kieio-marketing .faq-item summary::-webkit-details-marker { display: none; }
.kieio-marketing .faq-item summary::after {
  content: '+';
  font-family: var(--font-termina), sans-serif; font-size: 22px;
  color: var(--purple-soft); transition: transform 0.3s ease;
  margin-left: 16px;
}
.kieio-marketing .faq-item[open] summary::after { content: '−'; }
.kieio-marketing .faq-item p {
  margin-top: 14px; font-family: 'Noto Sans TC', sans-serif;
  font-size: 14px; line-height: 1.7; color: var(--mist);
}

/* Bottom CTA */
.kieio-marketing .bottom-cta {
  padding: 120px 32px; position: relative; overflow: hidden;
  background: radial-gradient(50% 50% at 50% 50%, rgba(85,37,131,0.30), transparent 70%);
  text-align: center;
}
.kieio-marketing .bottom-cta-inner { max-width: 820px; margin: 0 auto; }
.kieio-marketing .bottom-cta .k-logo { font-size: 60px; margin-bottom: 32px; }
.kieio-marketing .bottom-cta .k-mark { color: var(--purple); }
.kieio-marketing .bottom-cta h2 {
  font-family: var(--font-termina), sans-serif; font-weight: 700;
  font-size: clamp(36px, 5vw, 68px); letter-spacing: -0.050em; line-height: 1;
  text-transform: uppercase; margin-bottom: 22px;
}
.kieio-marketing .bottom-cta h2 .accent { color: var(--purple-soft); }
.kieio-marketing .bottom-cta .lede {
  font-family: 'Noto Sans TC', sans-serif; font-size: 16px; color: var(--mist);
  margin-bottom: 32px;
}
.kieio-marketing .cta-buttons { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.kieio-marketing .btn-primary {
  background: var(--purple); color: white !important; border: 0;
  padding: 16px 32px; border-radius: 6px;
  font-family: 'Geist', sans-serif; font-size: 15px; font-weight: 600;
  letter-spacing: 0.02em; text-decoration: none; display: inline-block;
  transition: all 0.2s;
}
.kieio-marketing .btn-primary:hover { background: #6b3a9c; transform: translateY(-2px); box-shadow: 0 12px 32px var(--purple-glow); }
.kieio-marketing .btn-secondary {
  background: transparent; color: var(--fg) !important;
  border: 1px solid var(--faint); padding: 16px 32px; border-radius: 6px;
  font-family: 'Geist', sans-serif; font-size: 15px; font-weight: 500;
  text-decoration: none; display: inline-block; transition: all 0.2s;
}
.kieio-marketing .btn-secondary:hover { border-color: var(--fg); }

/* Footer */
.kieio-marketing .marketing-footer {
  padding: 48px 32px 40px; border-top: 1px solid var(--line);
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: 24px;
}
.kieio-marketing .marketing-footer .brand { display: inline-flex; align-items: center; gap: 0.4em; text-decoration: none; }
.kieio-marketing .marketing-footer .brand .k-mark { font-size: 22px; color: var(--purple); }
.kieio-marketing .marketing-footer .brand .k-word { font-size: 16px; color: var(--mist); }
.kieio-marketing .marketing-footer .back-home {
  font-family: 'Noto Sans TC', sans-serif; font-size: 13px; color: var(--mist);
  text-decoration: none; transition: color 0.2s;
}
.kieio-marketing .marketing-footer .back-home:hover { color: var(--fg); }
.kieio-marketing .marketing-footer .meta {
  font-family: var(--font-geist-mono), monospace; font-size: 11px;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--dim);
}

@media (max-width: 900px) {
  .kieio-marketing .nav-links a:not(.nav-cta) { display: none; }
  .kieio-marketing .tier-grid { grid-template-columns: 1fr; }
  .kieio-marketing .tier-card.popular { transform: none; }
  .kieio-marketing .topup-grid { grid-template-columns: 1fr; }
}
`;
