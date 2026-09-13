import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { listQa } from "@/lib/db";
import { authenticatedStudentFromRequest } from "@/lib/student-session";
import { getObject } from "@/lib/storage";
export async function GET(request: NextRequest, context: RouteContext<"/api/qa/[id]/image">) { if (!isValidSession(request) && !await authenticatedStudentFromRequest(request)) return new NextResponse(null,{status:401}); const { id } = await context.params; const item = (await listQa(true)).find((entry) => entry.id === Number(id)); if (!item?.imageKey) return new NextResponse(null, { status: 404 }); const object = await getObject(item.imageKey); if (!object) return new NextResponse(null, { status: 404 }); return new NextResponse(new Uint8Array(object.body), { headers: { "Content-Type": object.contentType, "Cache-Control": "private, max-age=3600" } }); }
