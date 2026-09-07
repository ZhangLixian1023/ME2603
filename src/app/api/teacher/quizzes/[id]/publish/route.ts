import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { setQuizPublished } from "@/lib/db";
import { audit } from "@/lib/security";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, context: RouteContext<"/api/teacher/quizzes/[id]/publish">) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { published?: boolean } | null;
  const quizId = Number(id);
  if (!Number.isInteger(quizId) || typeof body?.published !== "boolean") {
    return NextResponse.json({ error: "参数错误" }, { status: 400 });
  }
  const changes = await setQuizPublished(quizId, body.published);
  if (!changes) return NextResponse.json({ error: "测验不存在" }, { status: 404 });
  audit("quiz.publish_changed", { quizId, published: body.published });
  return NextResponse.json({ ok: true });
}
