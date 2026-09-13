import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { syncRoster } from "@/lib/db";
export async function POST(request: NextRequest) { if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 }); const body = await request.json().catch(() => null) as { token?: string } | null; if (!body?.token) return NextResponse.json({ error: "同步预览已失效" }, { status: 400 }); try { return NextResponse.json({ result: await syncRoster(body.token) }); } catch { return NextResponse.json({ error: "同步预览已失效，请重新上传" }, { status: 409 }); } }
