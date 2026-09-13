import { NextRequest, NextResponse } from "next/server";
import { createStudentSessionToken, studentSessionCookieName } from "@/lib/auth";
import { getStudent } from "@/lib/db";
import { audit, checkRateLimit } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rate = checkRateLimit(request, "student-guest-login", 20, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });

  const body = await request.json().catch(() => null) as { studentId?: string; name?: string } | null;
  const studentId = body?.studentId?.trim() || "";
  const name = body?.name?.trim() || "";
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(studentId)) return NextResponse.json({ error: "请输入有效学号（2–30 位字母、数字、- 或 _）" }, { status: 400 });
  if (name.length < 1 || name.length > 40) return NextResponse.json({ error: "请输入 1–40 个字符的姓名" }, { status: 400 });
  if (await getStudent(studentId)) return NextResponse.json({ error: "该学号属于注册学生，请使用密码登录" }, { status: 409 });

  const student = { studentId, name, isGuest: true };
  const response = NextResponse.json({ student });
  response.cookies.set(studentSessionCookieName, createStudentSessionToken(studentId, name), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
  audit("student.guest_login");
  return response;
}
