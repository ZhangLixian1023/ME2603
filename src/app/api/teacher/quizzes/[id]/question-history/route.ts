import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { getQuizQuestionHistory } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext<"/api/teacher/quizzes/[id]/question-history">) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const quizId = Number(id);
  if (!Number.isInteger(quizId) || quizId < 1) return NextResponse.json({ error: "参数错误" }, { status: 400 });
  const history = await getQuizQuestionHistory(quizId);
  if (!history) return NextResponse.json({ error: "测验不存在" }, { status: 404 });
  return NextResponse.json(history);
}
