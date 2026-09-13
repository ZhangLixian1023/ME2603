import { NextRequest, NextResponse } from "next/server";
import { authenticateStudent } from "@/lib/db";
import { createStudentSessionToken, studentSessionCookieName } from "@/lib/auth";
import { audit, checkRateLimit } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const rate = checkRateLimit(request, "student-login", 15, 15 * 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });
  const body = await request.json().catch(() => null) as { studentId?: string; password?: string } | null;
  const studentId = body?.studentId?.trim() || ""; const password = body?.password || "";
  const student = await authenticateStudent(studentId, password);
  if (!student) { audit("student.login_failed"); return NextResponse.json({ error: "学号或密码不正确，或账号已停用" }, { status: 401 }); }
  const response = NextResponse.json({ student });
  response.cookies.set(studentSessionCookieName, createStudentSessionToken(student.studentId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
  return response;
}
