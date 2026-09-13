import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getPublicQuiz } from "@/lib/db";
import { authenticatedStudentFromRequest } from "@/lib/student-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext<"/api/quizzes/[code]">) {
  if (!await authenticatedStudentFromRequest(request)) return NextResponse.json({ error: "请先登录学生账号" }, { status: 401 });
  const { code } = await context.params;
  const quiz = await getPublicQuiz(code);
  if (!quiz) return NextResponse.json({ error: "测验不存在或尚未发布" }, { status: 404 });
  return NextResponse.json({ quiz });
}
