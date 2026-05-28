/**
 * Subdomain-split architecture (founder rule · 2026-05-25 · ACTIVE 2026-05-27).
 *
 * Live state:
 *   - Marketing pages live on kieio.com         (public · SEO-friendly · pre-login)
 *   - Product pages live on app.kieio.com       (auth-gated · the app surface)
 *
 * Enforced in two places:
 *   1. This file's appUrl() / marketingUrl() helpers — generate cross-domain
 *      absolute URLs when env vars NEXT_PUBLIC_APP_URL ≠ NEXT_PUBLIC_MARKETING_URL.
 *   2. middleware.ts — hostname-based 308 redirects when a route lands on the
 *      wrong subdomain (kieio.com/library → app.kieio.com/library, etc.).
 *
 * No code outside this file should hardcode either origin. Use the helpers
 * below so the split is a config-only change.
 *
 * ─────────────────────────────────────────────────────────────────
 * Route classification (which subdomain each route belongs to):
 * ─────────────────────────────────────────────────────────────────
 *
 *   Marketing  (xxx.com)        Product (app.xxx.com)
 *   ────────────────────        ─────────────────────
 *   /                            /login
 *   /pricing                     /auth/callback
 *   /about    (future)           /library  + /library/[id]
 *   /blog     (future)           /my
 *   /terms    (future)           /play/[id] + /play/[id]/memory
 *   /privacy  (future)           /stories/new
 *                                /settings
 *                                /profile
 *
 * `/login` lives on the product subdomain (Linear-style) — auth flow is
 * part of the app surface. Marketing CTAs link to /login via appUrl().
 */

/**
 * Session 16 audit HIGH-01 fix: harden the fallback chain.
 *
 * The original fallback `NEXT_PUBLIC_APP_URL || NEXT_PUBLIC_SITE_URL || localhost`
 * silently re-introduced the CRIT-05 bug if `NEXT_PUBLIC_APP_URL` was missing
 * in any env (since NEXT_PUBLIC_SITE_URL on prod = kieio.com / marketing).
 *
 * New chain:
 *   1. NEXT_PUBLIC_APP_URL                 (explicit · always honored)
 *   2. https://${VERCEL_URL}               (preview deploys auto-detect)
 *   3. NEXT_PUBLIC_SITE_URL                (legacy single-origin envs only)
 *   4. http://localhost:3001               (dev)
 *
 * In production, if (1) is unset we log a loud warning so misconfigs are
 * visible in Sentry / Vercel logs even if (3) saves the runtime.
 */
function appOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit;

  // Vercel preview detection — VERCEL_URL is the deployment hostname (no protocol)
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  if (process.env.NODE_ENV === "production") {
    // Don't throw (we'd break legacy single-origin deploys) but make the
    // misconfig loud so it shows up in logs.
    console.warn(
      "[lib/urls] NEXT_PUBLIC_APP_URL not set in production · falling back to NEXT_PUBLIC_SITE_URL · this re-introduces CRIT-05 (OAuth lands on marketing origin)",
    );
  }
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
}

function marketingOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_MARKETING_URL;
  if (explicit) return explicit;
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001";
}

/** True only when founder has split the two subdomains via env vars. */
function isSplit(): boolean {
  return appOrigin() !== marketingOrigin();
}

/**
 * Resolve a path against the product (app.xxx.com) origin.
 *
 * Same-domain world (today): returns the path unchanged so it stays a
 * same-origin client-side nav. Split world: returns an absolute URL so
 * navigation crosses subdomains correctly (full document load + new
 * cookie scope).
 *
 * Example:
 *   appUrl("/my")   →  "/my"                                  (today)
 *   appUrl("/my")   →  "https://app.xxx.com/my"               (split)
 */
export function appUrl(path: string): string {
  if (!isSplit()) return path;
  return new URL(path, appOrigin()).toString();
}

/**
 * Resolve a path against the marketing (xxx.com) origin.
 *
 * Same-domain world (today): returns the path unchanged.
 * Split world: returns an absolute URL pointing at the marketing site.
 *
 * Use this for links FROM product pages TO marketing pages (e.g. the
 * Pricing link in the product nav, or "About" / "Terms" footer links).
 */
export function marketingUrl(path: string): string {
  if (!isSplit()) return path;
  return new URL(path, marketingOrigin()).toString();
}

/** Absolute origins — use for OAuth redirectTo, server-side fetches, etc. */
export function getAppOrigin(): string {
  return appOrigin();
}
export function getMarketingOrigin(): string {
  return marketingOrigin();
}
