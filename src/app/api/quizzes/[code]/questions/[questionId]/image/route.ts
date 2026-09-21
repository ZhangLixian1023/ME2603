import { NextRequest, NextResponse } from "next/server";
import { getPublicQuestionImageKey } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { authenticatedStudentFromRequest } from "@/lib/student-session";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: RouteContext<"/api/quizzes/[code]/questions/[questionId]/image">) {
  if (!await authenticatedStudentFromRequest(request)) return new NextResponse(null, { status: 401 });
  const { code, questionId } = await context.params;
  const numericQuestionId = Number(questionId);
  if (!Number.isSafeInteger(numericQuestionId) || numericQuestionId < 1) return new NextResponse(null, { status: 404 });
  const imageKey = await getPublicQuestionImageKey(code, numericQuestionId);
  if (!imageKey) return new NextResponse(null, { status: 404 });
  const object = await getObject(imageKey);
  if (!object) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
