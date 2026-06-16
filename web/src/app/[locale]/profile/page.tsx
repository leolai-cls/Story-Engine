import { redirect } from "@/i18n/navigation";

/**
 * /profile is a legacy dead-end (was a "Phase 0.6" placeholder). All profile
 * functionality now lives on /settings. Permanently redirect there so the
 * route 404s nothing and the auth/landing logic never needs to special-case it.
 */
export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/settings", locale });
}
