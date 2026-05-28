/**
 * PostHog server-side client for API routes + webhooks.
 *
 * Used for server-only events that the browser can't observe — e.g.,
 * subscribe_success fires in the Stripe webhook handler (background
 * worker · no client session).
 *
 * No-op when POSTHOG_API_KEY unset.
 */
import { PostHog } from "posthog-node";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  if (client) return client;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.POSTHOG_API_KEY;
  if (!key) return null;
  client = new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
    flushAt: 1,        // ship event immediately · webhook handlers are short-lived
    flushInterval: 0,
  });
  return client;
}

/**
 * Server-side event capture. Distinct ID should be the user's Supabase id
 * so events link to client-side identifyUser().
 */
export async function captureServerEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    c.capture({ distinctId, event, properties });
    await c.shutdown();  // flush before lambda exits
  } catch (e) {
    console.warn(`[posthog] captureServerEvent failed:`, e);
  }
}
