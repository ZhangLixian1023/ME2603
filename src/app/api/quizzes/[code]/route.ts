import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { startQuizSession } from "@/lib/db";
import { authenticatedStudentFromRequest } from "@/lib/student-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext<"/api/quizzes/[code]">) {
  const student = await authenticatedStudentFromRequest(request);
  if (!student) return NextResponse.json({ error: "请先登录学生账号" }, { status: 401 });
  const { code } = await context.params;
  const session = await startQuizSession(code, student.studentId, student.name);
  if (!session) return NextResponse.json({ error: "测验不存在或尚未发布" }, { status: 404 });
  return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
}
