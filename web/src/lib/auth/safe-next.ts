/**
 * `next` redirect-param safety + locale-prefix utilities.
 *
 * Session 16 audit MED-05 + CRIT-06 fix: was duplicated between
 * /auth/callback/route.ts and /[locale]/login/actions.ts with drifted
 * return-on-invalid semantics ("" vs null). Now single source-of-truth.
 *
 * Also exposes resolveLocale() so /auth/callback (which lives outside
 * [locale]/) can derive the user's locale and emit locale-prefixed
 * redirects, fixing the CRIT-06 OAuth locale-flip bug.
 */
import { routing, type Locale } from "@/i18n/routing";

/**
 * Validate `next` is a relative path that can't escape our origin.
 * `//evil.com` and `\\evil.com` get treated by browsers as
 * protocol-relative external redirects.
 *
 * Returns null when raw is missing OR invalid.
 */
export function safeRelativeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length > 200) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/^\/?[a-z]+:/i.test(raw)) return null;
  return raw;
}

/** Form-input variant: returns "" instead of null so callers can fall through. */
export function safeRelativeNextFromForm(formData: FormData): string {
  return safeRelativeNext(String(formData.get("next") || "")) ?? "";
}

const LOCALE_PREFIX_RE = /^\/(en|zh-Hans|zh-Hant)(\/.*|$)/;

/** Extract locale from a `next` path if it has one (e.g., /en/library → "en"). */
export function localeFromPath(path: string | null | undefined): Locale | null {
  if (!path) return null;
  const m = path.match(LOCALE_PREFIX_RE);
  return m ? (m[1] as Locale) : null;
}

function isValidLocale(l: string | null | undefined): l is Locale {
  if (!l) return false;
  return (routing.locales as readonly string[]).includes(l);
}

/**
 * Resolve locale outside of an [locale]/ route. Tries:
 *   1. `next` searchParam (most reliable — user came from a localized page)
 *   2. `NEXT_LOCALE` cookie (set by next-intl when user toggles locale)
 *   3. `Accept-Language` header (provider hop usually preserves)
 *   4. Default locale (zh-Hant)
 *
 * Used by /auth/callback so OAuth round-trip doesn't drop the user's locale.
 */
export function resolveLocale(opts: {
  next: string | null;
  cookieLocale: string | null;
  acceptLanguage: string | null;
}): Locale {
  // 1. From next param
  const fromNext = localeFromPath(opts.next);
  if (fromNext) return fromNext;

  // 2. From cookie
  if (isValidLocale(opts.cookieLocale)) return opts.cookieLocale;

  // 3. From Accept-Language — prefer exact match, then language tag prefix
  if (opts.acceptLanguage) {
    const tags = opts.acceptLanguage
      .split(",")
      .map((t) => t.split(";")[0].trim());
    for (const tag of tags) {
      if (isValidLocale(tag)) return tag;
    }
    for (const tag of tags) {
      const lower = tag.toLowerCase();
      if (lower.startsWith("zh-tw") || lower.startsWith("zh-hk") || lower === "zh-hant") return "zh-Hant";
      if (lower.startsWith("zh-cn") || lower.startsWith("zh-sg") || lower === "zh-hans" || lower === "zh") return "zh-Hans";
      if (lower.startsWith("en")) return "en";
    }
  }

  // 4. Default
  return routing.defaultLocale as Locale;
}

/**
 * Prepend the locale prefix to a path if needed. Honors `localePrefix:
 * "as-needed"` — the default locale (zh-Hant) gets NO prefix.
 *
 *   localizePath("/library", "zh-Hant") → "/library"
 *   localizePath("/library", "en")      → "/en/library"
 *   localizePath("/en/library", "en")   → "/en/library"  (already prefixed)
 *   localizePath("/zh-Hant/library", "zh-Hant") → "/library"  (strip default)
 */
export function localizePath(path: string, locale: Locale): string {
  const existing = localeFromPath(path);
  if (existing) {
    // Strip the existing prefix and re-add according to locale + as-needed rule
    const bare = path.replace(LOCALE_PREFIX_RE, "$2") || "/";
    return locale === routing.defaultLocale ? bare : `/${locale}${bare === "/" ? "" : bare}`;
  }
  // No existing prefix — add only if non-default
  return locale === routing.defaultLocale ? path : `/${locale}${path === "/" ? "" : path}`;
}
