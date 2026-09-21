import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { deleteQuestionImages, isQuestionImageKey, saveQuestionImage } from "@/lib/question-images";
import { getObject } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isValidSession(request)) return new NextResponse(null, { status: 401 });
  const key = request.nextUrl.searchParams.get("key");
  if (!isQuestionImageKey(key)) return new NextResponse(null, { status: 404 });
  const object = await getObject(key);
  if (!object) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "请选择图片" }, { status: 400 });
  try {
    const imageKey = await saveQuestionImage(file);
    return NextResponse.json({ imageKey }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_IMAGE_SIZE") {
      return NextResponse.json({ error: "图片不能超过 5 MB" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_IMAGE_TYPE") {
      return NextResponse.json({ error: "仅支持 JPG、JPEG 和 PNG 图片" }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as { imageKey?: string } | null;
  if (!isQuestionImageKey(body?.imageKey)) return NextResponse.json({ error: "图片标识无效" }, { status: 400 });
  await deleteQuestionImages([body.imageKey]);
  return NextResponse.json({ ok: true });
}
