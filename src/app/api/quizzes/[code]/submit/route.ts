import { NextRequest, NextResponse } from "next/server";
import { getQuizAttemptState, submitQuiz } from "@/lib/db";
import { authenticatedStudentFromRequest } from "@/lib/student-session";
import { audit, checkRateLimit } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: RouteContext<"/api/quizzes/[code]/submit">) {
  const { code } = await context.params;
  const body = await request.json().catch(() => null) as {
    answers?: number[];
  } | null;
  const student = await authenticatedStudentFromRequest(request);
  if (!student) return NextResponse.json({ error: "请先登录学生账号" }, { status: 401 });
  const rate = checkRateLimit(request, `quiz-submit:${code}:${student.studentId}`, 12, 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "提交过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  if (!Array.isArray(body?.answers)) {
    return NextResponse.json({ error: "请完成全部题目" }, { status: 400 });
  }

  try {
    const result = await submitQuiz(code, student.studentId, student.name, body.answers);
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
    if (message === "ATTEMPT_NOT_STARTED") {
      return NextResponse.json({ error: "答题尚未开始，请重新进入测验" }, { status: 409 });
    }
    if (message === "ATTEMPT_EXPIRED") {
      const state = await getQuizAttemptState(code, student.studentId).catch(() => null);
      if (state?.attempt.result) return NextResponse.json(state.attempt.result);
      return NextResponse.json({ error: "答题时间已结束" }, { status: 409 });
    }
    return NextResponse.json({ error: "提交失败，请稍后重试" }, { status: 500 });
  }
}
