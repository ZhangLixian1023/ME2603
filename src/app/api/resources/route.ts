import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { listResources } from "@/lib/db";
import { authenticatedStudentFromRequest } from "@/lib/student-session";
export async function GET(request: NextRequest) { if (!isValidSession(request) && !await authenticatedStudentFromRequest(request)) return NextResponse.json({ error:"请先登录" },{status:401}); return NextResponse.json({ resources: await listResources() }); }
