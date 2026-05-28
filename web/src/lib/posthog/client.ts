"use client";

/**
 * PostHog browser client init.
 *
 * Session 16 PM Review #2 (P-02) installation. Captures pageviews +
 * autocapture (clicks) + explicit posthog.capture calls. Identifies
 * authed users via posthog.identify so session events link to the
 * user's distinct_id.
 *
 * No-op when NEXT_PUBLIC_POSTHOG_KEY unset (dev / preview without
 * observability). Calling posthog.capture etc. on uninitialized
 * instance is safe — posthog-js handles the case gracefully.
 */
import posthog from "posthog-js";

let initialized = false;

export function initPostHog() {
  if (initialized) return;
  if (typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    capture_pageview: "history_change",  // auto-capture on next-intl route changes
    capture_pageleave: true,
    capture_performance: true,
    disable_session_recording: true,    // launch-day cost guard · enable later
    // Avoid sending events from localhost in development
    loaded: (ph) => {
      if (process.env.NODE_ENV !== "production") ph.opt_out_capturing();
    },
  });

  initialized = true;
}

export { posthog };

/** Identify the current user so future events link to their distinct_id. */
export function identifyUser(userId: string, traits: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  initPostHog();
  posthog.identify(userId, traits);
}

/** Capture a custom event safely (no-op when PostHog unconfigured). */
export function captureEvent(event: string, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  initPostHog();
  posthog.capture(event, properties);
}

/** Reset on signout — drops the distinct_id binding so next user is separate. */
export function resetPostHog() {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  posthog.reset();
}
