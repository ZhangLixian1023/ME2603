import { NextRequest, NextResponse } from "next/server";
import { authenticatedStudentFromRequest } from "@/lib/student-session";
export async function GET(request: NextRequest) { const student = await authenticatedStudentFromRequest(request); return NextResponse.json({ authenticated: Boolean(student), student }); }
