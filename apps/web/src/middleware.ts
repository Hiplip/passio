import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Redirects anonymous requests away from the signed-in area.
 *
 * This is a convenience only. The real authorization is `protectedProcedure` on
 * every tRPC call - middleware checks for a cookie's presence, not its
 * validity, so it must never be the only thing standing in front of data.
 */
export function middleware(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const url = new URL("/login", request.url);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/vault/:path*", "/unlock", "/settings/:path*"],
};
