import { type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";

const intl = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  // 1. Run next-intl first (may return a locale redirect/rewrite)
  const response = intl(request);
  // 2. Refresh Supabase session on top of that response
  await updateSession(request, response);
  return response;
}

export const config = {
  matcher: [
    // Exclude api/_next/_vercel, the bare /auth callback path, and files with extensions
    "/((?!api|_next|_vercel|auth|.*\\..*).*)",
  ],
};
