import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { getGradebook } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isValidSession(request)) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  return NextResponse.json(await getGradebook());
}
