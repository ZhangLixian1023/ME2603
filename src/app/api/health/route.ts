import { NextResponse } from "next/server";
import { checkDatabase, getDatabaseMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await checkDatabase();
    return NextResponse.json({ status: "ok", database: getDatabaseMode() });
  } catch (error) {
    console.error("[health] PostgreSQL check failed", error);
    return NextResponse.json(
      { status: "unhealthy", database: getDatabaseMode() },
      { status: 503 },
    );
  }
}
