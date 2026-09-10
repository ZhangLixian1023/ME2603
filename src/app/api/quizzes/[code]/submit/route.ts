import { NextRequest, NextResponse } from "next/server";
import { submitQuiz } from "@/lib/db";
import { audit, checkRateLimit } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext<"/api/quizzes/[code]/submit">) {
  const { code } = await context.params;
  const rate = checkRateLimit(request, `quiz-submit:${code}`, 12, 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "提交过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const body = await request.json().catch(() => null) as {
    studentId?: string;
    nickname?: string;
    answers?: number[];
  } | null;
  const studentId = body?.studentId?.trim() || "";
  const nickname = body?.nickname?.trim() || "";
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(studentId)) {
    return NextResponse.json({ error: "学号应为 2–30 位字母、数字、- 或 _" }, { status: 400 });
  }
  if (nickname.length < 1 || nickname.length > 20) {
    return NextResponse.json({ error: "姓名应为 1–20 个字符" }, { status: 400 });
  }
  if (!Array.isArray(body?.answers)) {
    return NextResponse.json({ error: "请完成全部题目" }, { status: 400 });
  }

  try {
    const result = await submitQuiz(code, studentId, nickname, body.answers);
    audit("submission.created", { code: code.toUpperCase(), score: result.score, total: result.total });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "ALREADY_SUBMITTED") {
      audit("submission.duplicate_blocked", { code: code.toUpperCase() });
      return NextResponse.json({ error: "这个学号已经提交过本次测验" }, { status: 409 });
    }
    if (message === "QUIZ_NOT_FOUND") {
      return NextResponse.json({ error: "测验不存在或尚未发布" }, { status: 404 });
    }
    if (message === "INVALID_ANSWERS") {
      return NextResponse.json({ error: "请完成全部题目" }, { status: 400 });
    }
    return NextResponse.json({ error: "提交失败，请稍后重试" }, { status: 500 });
  }
}
