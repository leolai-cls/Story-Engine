/**
 * Sentry client-side init.
 *
 * Session 16 PM Review #2 (P-02) installation. Captures browser-side
 * uncaught errors, unhandled promise rejections, and explicit
 * Sentry.captureException calls.
 *
 * Init is a no-op when NEXT_PUBLIC_SENTRY_DSN is unset (dev / preview
 * without observability) — Sentry SDK gracefully skips network calls.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Sample 10% of normal sessions; 100% of errored sessions
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,           // disable Session Replay for now (cost)
    replaysOnErrorSampleRate: 1.0,         // capture replay only on error
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Filter out noise · Next.js hydration warnings · dev-only HMR events
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "Hydration failed",
      "There was an error while hydrating",
    ],
    // Don't send events from localhost in development
    enabled: process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview",
  });
}
