import QuizClient from "@/components/QuizClient";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { studentSessionCookieName } from "@/lib/auth";
import { authenticatedStudentFromToken } from "@/lib/student-session";

export default async function QuizPage({ params }: PageProps<"/quiz/[code]">) {
  const { code } = await params;
  const normalizedCode = code.toUpperCase();
  const cookieStore = await cookies();
  const student = await authenticatedStudentFromToken(cookieStore.get(studentSessionCookieName)?.value || "");
  if (!student) redirect(`/student?next=${encodeURIComponent(`/quiz/${normalizedCode}`)}`);
  return <QuizClient code={normalizedCode} />;
}
