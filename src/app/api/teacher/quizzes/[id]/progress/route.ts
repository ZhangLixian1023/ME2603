import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { getQuizProgress } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext<"/api/teacher/quizzes/[id]/progress">) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const quizId = Number(id);
  if (!Number.isInteger(quizId)) return NextResponse.json({ error: "测验不存在" }, { status: 404 });
  const progress = await getQuizProgress(quizId);
  if (!progress) return NextResponse.json({ error: "测验不存在" }, { status: 404 });
  return NextResponse.json({ progress }, { headers: { "Cache-Control": "no-store" } });
}
