import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Keep in sync with src/lib/dfri-eid.ts and the verifier proxy.
const DFRI_SUBJECT_HEADER = "x-dfri-eid-subject";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login/help page without a verified identity.
  if (pathname === "/internal/login") {
    return NextResponse.next();
  }

  const subject = request.headers.get(DFRI_SUBJECT_HEADER)?.trim();
  if (subject) {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/internal/login";
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/internal/:path*"],
};
