import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createQa, listQa } from "@/lib/db";
import { putObject } from "@/lib/storage";
import { authenticatedStudentFromRequest } from "@/lib/student-session";

export const runtime = "nodejs";
export async function GET(request: NextRequest) { if (!await authenticatedStudentFromRequest(request)) return NextResponse.json({ error: "请先登录学生账号" }, { status: 401 }); return NextResponse.json({ items: await listQa(false) }); }
export async function POST(request: NextRequest) {
  const student = await authenticatedStudentFromRequest(request); if (!student) return NextResponse.json({ error: "请先登录学生账号" }, { status: 401 });
  const form = await request.formData(); const question = String(form.get("question") || "").trim(); const image = form.get("image");
  if (question.length < 2 || question.length > 1000) return NextResponse.json({ error: "问题应为 2–1000 个字符" }, { status: 400 });
  let imageKey: string | null = null;
  if (image instanceof File && image.size) { if (image.size > 5 * 1024 * 1024 || !["image/jpeg","image/png","image/webp","image/gif"].includes(image.type)) return NextResponse.json({ error: "图片须为 JPG、PNG、WebP 或 GIF，且不超过 5MB" }, { status: 400 }); imageKey = `qa/${randomUUID()}`; await putObject(imageKey, Buffer.from(await image.arrayBuffer()), image.type); }
  return NextResponse.json({ item: await createQa(student.studentId, question, imageKey, student.isGuest ? student.name : undefined) }, { status: 201 });
}
