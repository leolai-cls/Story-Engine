import type { CSSProperties, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { marketingUrl, appUrl } from "@/lib/urls";

/**
 * A link that may point at the OTHER subdomain (marketing ⇄ product).
 *
 * Why this exists (2026-06-17 · founder caught CORS errors in console):
 * after the kieio.com / app.kieio.com split, any plain i18n <Link> to a route
 * on the other subdomain still RSC-PREFETCHES it (Next default). That prefetch
 * is a cross-origin fetch → blocked by CORS → a red error per link in the
 * console (e.g. app.kieio.com prefetching /terms → 308 → kieio.com/terms).
 * Clicking still works (full-document nav follows the 308), but the background
 * prefetch spams the console and wastes a request.
 *
 * Fix: resolve the path against the correct origin (marketingUrl / appUrl).
 *  - Split world → absolute cross-origin URL → render a plain <a> (Next never
 *    prefetches external URLs → no CORS noise · click = full nav, correct).
 *  - Same-origin world (dev / preview single origin) → i18n <Link> keeps the
 *    locale-aware client-side navigation we want.
 *
 * Mirrors the inline logic already in site-header.tsx; extracted so the footer
 * and the scattered legal/pricing links share ONE correct implementation.
 */
export function CrossSubdomainLink({
  to,
  path,
  className,
  style,
  title,
  "aria-label": ariaLabel,
  onClick,
  children,
}: {
  /** Which subdomain the route lives on. */
  to: "marketing" | "product";
  /** Bare path on that subdomain, e.g. "/terms" or "/library". */
  path: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  "aria-label"?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const href = to === "marketing" ? marketingUrl(path) : appUrl(path);

  if (/^https?:\/\//.test(href)) {
    return (
      <a
        href={href}
        className={className}
        style={style}
        title={title}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href as never}
      className={className}
      style={style}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
