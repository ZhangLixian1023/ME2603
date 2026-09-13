import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { isValidSession } from "@/lib/auth";
import { previewRoster, type RosterStudent } from "@/lib/db";

export const runtime = "nodejs";

function clean(value: unknown) { return String(value ?? "").trim(); }

export async function POST(request: NextRequest) {
  if (!isValidSession(request)) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const form = await request.formData(); const file = form.get("file");
  if (!(file instanceof File) || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "请选择不超过 5MB 的 Excel 文件" }, { status: 400 });
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
    const headerIndex = rows.findIndex((row) => row.some((cell) => /^(学号|student\s*id|student number|sid)$/i.test(clean(cell))) && row.some((cell) => /^(姓名|name|student\s*name)$/i.test(clean(cell))));
    if (headerIndex < 0) return NextResponse.json({ error: "找不到“学号”和“姓名”列" }, { status: 400 });
    const headers = rows[headerIndex].map(clean); const idIndex = headers.findIndex((v) => /^(学号|student\s*id|student number|sid)$/i.test(v)); const nameIndex = headers.findIndex((v) => /^(姓名|name|student\s*name)$/i.test(v));
    const students: RosterStudent[] = rows.slice(headerIndex + 1).map((row) => ({ studentId: clean(row[idIndex]), name: clean(row[nameIndex]) })).filter((s) => s.studentId && s.name && s.studentId.length <= 50 && s.name.length <= 100);
    if (!students.length) return NextResponse.json({ error: "名单中没有有效学生记录" }, { status: 400 });
    return NextResponse.json({ preview: await previewRoster(students) });
  } catch { return NextResponse.json({ error: "无法读取该 Excel，请确认文件格式" }, { status: 400 }); }
}
