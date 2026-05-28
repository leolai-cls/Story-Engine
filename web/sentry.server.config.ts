/**
 * Sentry server-side init.
 *
 * Captures server-side uncaught errors in API routes, server actions,
 * RSC rendering. Critical paths: turn route (LLM provider failure),
 * Stripe webhook (idempotency / signature failure), auth callback.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    enabled: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "preview",
  });
}
