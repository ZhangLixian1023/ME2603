import QuizClient from "@/components/QuizClient";

export default async function QuizPage({ params }: PageProps<"/quiz/[code]">) {
  const { code } = await params;
  return <QuizClient code={code.toUpperCase()} />;
}
