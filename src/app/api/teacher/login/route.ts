import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, sessionCookieName, teacherPassword } from "@/lib/auth";
import { audit, checkRateLimit } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rate = checkRateLimit(request, "teacher-login", 10, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "尝试次数过多，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (!body || body.password !== teacherPassword()) {
    audit("teacher.login_failed");
    return NextResponse.json({ error: "密码不正确" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  audit("teacher.login_succeeded");
  return response;
}
