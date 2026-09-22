import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { getQuizProgress, getQuizResults } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext<"/api/teacher/quizzes/[id]/results">) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const quizId = Number(id);
  await getQuizProgress(quizId);
  const results = await getQuizResults(quizId);
  if (!results) return NextResponse.json({ error: "测验不存在" }, { status: 404 });
  return NextResponse.json(results);
}
