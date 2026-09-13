import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { deleteResource } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
export async function DELETE(request: NextRequest, context: RouteContext<"/api/teacher/resources/[id]">) { if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 }); const { id } = await context.params; const removed = await deleteResource(Number(id)); if (!removed) return NextResponse.json({ error: "文件不存在" }, { status: 404 }); await deleteObject(removed.objectKey); return NextResponse.json({ ok: true }); }
