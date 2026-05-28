"use client";

/**
 * PostHog provider · mounts client-side init + identify on auth state change.
 *
 * Wrapped around the entire app in layout.tsx so every page has analytics
 * coverage. Identify fires once when user prop arrives (login) and reset
 * fires on sign-out.
 */
import { useEffect } from "react";
import { initPostHog, identifyUser, resetPostHog } from "@/lib/posthog/client";

export function PostHogProvider({
  userId,
  userTraits,
  children,
}: {
  userId: string | null;
  userTraits?: { email?: string | null; displayName?: string | null; locale?: string };
  children: React.ReactNode;
}) {
  useEffect(() => {
    initPostHog();
    if (userId) {
      identifyUser(userId, {
        email: userTraits?.email ?? undefined,
        display_name: userTraits?.displayName ?? undefined,
        locale: userTraits?.locale ?? undefined,
      });
    } else {
      resetPostHog();
    }
  }, [userId, userTraits?.email, userTraits?.displayName, userTraits?.locale]);

  return <>{children}</>;
}
