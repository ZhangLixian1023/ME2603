import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/quizzes/[code]/leaderboard">) {
  const { code } = await context.params;
  const leaderboard = await getLeaderboard(code);
  if (!leaderboard) return NextResponse.json({ error: "测验不存在或尚未发布" }, { status: 404 });
  return NextResponse.json(leaderboard);
}
