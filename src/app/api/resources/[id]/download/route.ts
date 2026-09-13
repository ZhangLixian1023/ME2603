import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { getResource } from "@/lib/db";
import { authenticatedStudentFromRequest } from "@/lib/student-session";
import { getObject } from "@/lib/storage";
export async function GET(request: NextRequest, context: RouteContext<"/api/resources/[id]/download">) { if (!isValidSession(request) && !await authenticatedStudentFromRequest(request)) return new NextResponse(null,{status:401}); const { id } = await context.params; const resource = await getResource(Number(id)); if (!resource) return new NextResponse(null, { status: 404 }); const object = await getObject(String(resource.objectKey)); if (!object) return new NextResponse(null, { status: 404 }); const safeName = String(resource.filename).replace(/["\r\n]/g, "_"); return new NextResponse(new Uint8Array(object.body), { headers: { "Content-Type": String(resource.mimeType), "Content-Length": String(resource.size), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}` } }); }
