import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return NextResponse.json({ authenticated: isValidSession(request) });
}
