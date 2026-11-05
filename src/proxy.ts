import { NextResponse, type NextRequest } from "next/server";
import { isLocale, preferredLocale } from "@/i18n";

/** Every page lives under its language (/id/…, /en/…); a path without one goes to the browser's language. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return;
  const url = request.nextUrl.clone();
  url.pathname = `/${preferredLocale(request.headers.get("accept-language"))}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: not Next.js internals, API routes or files with an extension (icons, images).
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
