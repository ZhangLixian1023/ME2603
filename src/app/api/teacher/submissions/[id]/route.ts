import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { deleteSubmission } from "@/lib/db";
import { audit } from "@/lib/security";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, context: RouteContext<"/api/teacher/submissions/[id]">) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const submissionId = Number(id);
  const changes = await deleteSubmission(submissionId);
  if (!changes) return NextResponse.json({ error: "提交记录不存在" }, { status: 404 });
  audit("submission.deleted", { submissionId });
  return NextResponse.json({ ok: true });
}
