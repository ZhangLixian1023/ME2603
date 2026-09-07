import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { deleteQuiz, getTeacherQuiz, updateQuiz, type QuestionInput } from "@/lib/db";
import { audit } from "@/lib/security";

export const runtime = "nodejs";

function validInput(body: { title?: string; description?: string; questions?: QuestionInput[] } | null) {
  const title = body?.title?.trim() || "";
  const questions = body?.questions || [];
  return title.length >= 2 && title.length <= 80 && questions.length >= 1 && questions.length <= 50 && questions.every((question) => {
    const options = question.options?.map((option) => option.trim()) || [];
    return question.prompt?.trim().length > 0 && options.length >= 2 && options.length <= 6 && options.every(Boolean) && Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < options.length;
  });
}

export async function GET(request: NextRequest, context: RouteContext<"/api/teacher/quizzes/[id]">) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const quiz = await getTeacherQuiz(Number(id));
  if (!quiz) return NextResponse.json({ error: "测验不存在" }, { status: 404 });
  return NextResponse.json({ quiz });
}

export async function PUT(request: NextRequest, context: RouteContext<"/api/teacher/quizzes/[id]">) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { title?: string; description?: string; questions?: QuestionInput[] } | null;
  if (!validInput(body)) return NextResponse.json({ error: "请完整填写标题、题目、选项和正确答案" }, { status: 400 });
  try {
    await updateQuiz(Number(id), {
      title: body!.title!.trim(), description: body!.description?.trim().slice(0, 240),
      questions: body!.questions!.map((q) => ({ prompt:q.prompt.trim(), options:q.options.map((o)=>o.trim()), correctIndex:q.correctIndex })),
    });
    audit("quiz.updated", { quizId:Number(id) });
    return NextResponse.json({ ok:true });
  } catch (error) {
    if (error instanceof Error && error.message === "QUIZ_HAS_SUBMISSIONS") return NextResponse.json({ error:"已有学生提交，不能再修改题目。可新建一份测验。" }, { status:409 });
    if (error instanceof Error && error.message === "QUIZ_NOT_FOUND") return NextResponse.json({ error:"测验不存在" }, { status:404 });
    throw error;
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/teacher/quizzes/[id]">) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const quizId=Number(id); const changes=await deleteQuiz(quizId);
  if(!changes) return NextResponse.json({error:"测验不存在"},{status:404});
  audit("quiz.deleted",{quizId}); return NextResponse.json({ok:true});
}
