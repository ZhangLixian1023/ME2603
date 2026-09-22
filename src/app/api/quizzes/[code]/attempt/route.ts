import { NextRequest, NextResponse } from "next/server";
import { getQuizAttemptState, saveQuizAnswer } from "@/lib/db";
import { authenticatedStudentFromRequest } from "@/lib/student-session";
import { checkRateLimit } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext<"/api/quizzes/[code]/attempt">) {
  const student = await authenticatedStudentFromRequest(request);
  if (!student) return NextResponse.json({ error: "请先登录学生账号" }, { status: 401 });
  const { code } = await context.params;
  const rate = checkRateLimit(request, `quiz-attempt-read:${code}:${student.studentId}`, 180, 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "刷新过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });

  try {
    const state = await getQuizAttemptState(code, student.studentId);
    if (!state) return NextResponse.json({ error: "测验不存在或尚未发布" }, { status: 404 });
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "ATTEMPT_NOT_STARTED") {
      return NextResponse.json({ error: "答题尚未开始，请重新进入测验" }, { status: 409 });
    }
    return NextResponse.json({ error: "无法读取答题进度" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/quizzes/[code]/attempt">) {
  const student = await authenticatedStudentFromRequest(request);
  if (!student) return NextResponse.json({ error: "请先登录学生账号" }, { status: 401 });
  const { code } = await context.params;
  const rate = checkRateLimit(request, `quiz-attempt-save:${code}:${student.studentId}`, 180, 60 * 1000);
  if (!rate.allowed) return NextResponse.json({ error: "保存过于频繁，请稍后再试" }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const body = await request.json().catch(() => null) as { questionIndex?: number; answer?: number } | null;
  if (!Number.isInteger(body?.questionIndex) || !Number.isInteger(body?.answer)) {
    return NextResponse.json({ error: "答案格式不正确" }, { status: 400 });
  }

  try {
    const attempt = await saveQuizAnswer(code, student.studentId, Number(body?.questionIndex), Number(body?.answer));
    return NextResponse.json({ attempt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    if (message === "QUIZ_NOT_FOUND") return NextResponse.json({ error: "测验不存在或尚未发布" }, { status: 404 });
    if (message === "ATTEMPT_NOT_STARTED") return NextResponse.json({ error: "答题尚未开始，请重新进入测验" }, { status: 409 });
    if (message === "INVALID_ANSWER") return NextResponse.json({ error: "答案格式不正确" }, { status: 400 });
    return NextResponse.json({ error: "答案保存失败，请稍后重试" }, { status: 500 });
  }
}
