import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {};

// Wrap with Sentry · auto-instrumentation for server + edge + client.
// Session 16 PM Review #2 (P-02): without this, prod 5xx errors are invisible.
// Sentry SDK gracefully no-ops when SENTRY_AUTH_TOKEN / NEXT_PUBLIC_SENTRY_DSN
// are unset (dev / preview · no source map upload · no event send).
export default withSentryConfig(withNextIntl(nextConfig), {
  // Suppress sourcemap upload logs unless explicitly needed
  silent: !process.env.CI,
  // Sentry org + project — set via env vars in Vercel
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Upload source maps in production only · requires SENTRY_AUTH_TOKEN
  widenClientFileUpload: true,
  // Tunnel through /api/sentry to bypass ad-blockers · improves event capture
  tunnelRoute: "/monitoring",
  // Reduce bundle bloat from Sentry SDK debug logging
  disableLogger: true,
});
