import { NextRequest, NextResponse } from "next/server";
import { isValidSession } from "@/lib/auth";
import { getQuizResults } from "@/lib/db";
import { audit } from "@/lib/security";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  let text=String(value ?? "");
  if (/^[=+\-@]/.test(text)) text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}

export async function GET(request: NextRequest, context: RouteContext<"/api/teacher/quizzes/[id]/export">) {
  if (!isValidSession(request)) return NextResponse.json({ error:"请先登录" }, { status:401 });
  const { id }=await context.params; const quizId=Number(id); const results=await getQuizResults(quizId);
  if(!results) return NextResponse.json({error:"测验不存在"},{status:404});
  const rows=[
    ["姓名","学号","正确题数","总题数","提交时间"],
    ...results.submissions.map((item) => [item.nickname,item.studentId,item.score,item.total,item.submittedAt]),
  ];
  const csv="\uFEFF"+rows.map((row)=>row.map(csvCell).join(",")).join("\r\n");
  audit("results.exported",{quizId,rows:results.submissions.length});
  return new NextResponse(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="quiz-${String(results.quiz.code)}-results.csv"`,"Cache-Control":"no-store"}});
}
