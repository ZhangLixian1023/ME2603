import { NextResponse } from "next/server";
import { getPublicQuiz } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/quizzes/[code]">) {
  const { code } = await context.params;
  const quiz = await getPublicQuiz(code);
  if (!quiz) return NextResponse.json({ error: "测验不存在或尚未发布" }, { status: 404 });
  return NextResponse.json({ quiz });
}
