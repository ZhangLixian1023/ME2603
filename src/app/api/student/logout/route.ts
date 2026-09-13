import { NextResponse } from "next/server";
import { studentSessionCookieName } from "@/lib/auth";
export async function POST() { const response = NextResponse.json({ ok: true }); response.cookies.set(studentSessionCookieName, "", { maxAge: 0, path: "/" }); return response; }
