import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { createQuiz, listQuizzes, type QuestionInput } from "@/lib/db";
import { audit } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json({ quizzes: await listQuizzes() });
}

export async function POST(request: NextRequest) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    title?: string;
    description?: string;
    questions?: QuestionInput[];
    published?: boolean;
  } | null;

  const title = body?.title?.trim() || "";
  const questions = body?.questions || [];
  const valid = title.length >= 2 && title.length <= 80 && questions.length >= 1 && questions.length <= 50 &&
    questions.every((question) => {
      const options = question.options?.map((option) => option.trim()) || [];
      return question.prompt?.trim().length > 0 && options.length >= 2 && options.length <= 6 &&
        options.every(Boolean) && Number.isInteger(question.correctIndex) &&
        question.correctIndex >= 0 && question.correctIndex < options.length;
    });
  if (!valid) return NextResponse.json({ error: "请完整填写标题、题目、选项和正确答案" }, { status: 400 });

  const normalizedQuestions = questions.map((question) => ({
    prompt: question.prompt.trim(),
    options: question.options.map((option) => option.trim()),
    correctIndex: question.correctIndex,
  }));
  const quiz = await createQuiz({
    title,
    description: body?.description?.trim().slice(0, 240),
    questions: normalizedQuestions,
    published: Boolean(body?.published),
  });
  audit("quiz.created", { quizId: quiz.id, code: quiz.code, published: Boolean(body?.published) });
  return NextResponse.json({ quiz }, { status: 201 });
}
