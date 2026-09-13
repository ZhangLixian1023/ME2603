import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { answerQa } from "@/lib/db";
export async function PATCH(request: NextRequest, context: RouteContext<"/api/teacher/qa/[id]">) { if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 }); const { id } = await context.params; const body = await request.json().catch(() => null) as { answer?: string } | null; const answer = body?.answer?.trim() || ""; if (!answer || answer.length > 3000) return NextResponse.json({ error: "回答不能为空且不能超过 3000 字" }, { status: 400 }); return NextResponse.json({ ok: Boolean(await answerQa(Number(id), answer)) }); }
