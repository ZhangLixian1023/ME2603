"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "./LanguageProvider";

type RosterPreview = {
  token: string;
  total: number;
  add: Array<{ studentId: string; name: string }>;
  update: Array<{ studentId: string; name: string; previousName: string }>;
  deactivate: Array<{ studentId: string; name: string }>;
  unchanged: number;
};

type Gradebook = {
  quizzes: Array<{ id: number; code: string; title: string; total: number }>;
  students: Array<{
    studentId: string;
    name: string;
    active: boolean;
    scores: Array<{ quizId: number; score: number; total: number; submittedAt: string }>;
  }>;
};

type Qa = {
  id: number;
  studentId?: string;
  studentName: string;
  question: string;
  imageKey?: string | null;
  answer?: string | null;
};

type Resource = { id: number; title: string; filename: string; size: number };

export default function TeacherTools() {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [gradebook, setGradebook] = useState<Gradebook | null>(null);
  const [gradebookLoading, setGradebookLoading] = useState(true);
  const [studentQuery, setStudentQuery] = useState("");
  const [qa, setQa] = useState<Qa[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loadError, setLoadError] = useState("");
  const [rosterMessage, setRosterMessage] = useState("");
  const [resourceMessage, setResourceMessage] = useState("");
  const [resourceUploading, setResourceUploading] = useState(false);

  const load = useCallback(async () => {
    setGradebookLoading(true);
    try {
      const [qaResponse, resourceResponse, gradebookResponse] = await Promise.all([
        fetch("/api/teacher/qa", { cache: "no-store" }),
        fetch("/api/teacher/resources", { cache: "no-store" }),
        fetch("/api/teacher/gradebook", { cache: "no-store" }),
      ]);
      if (!qaResponse.ok || !resourceResponse.ok || !gradebookResponse.ok) {
        throw new Error("TEACHER_TOOLS_LOAD_FAILED");
      }
      const [qaData, resourceData, gradebookData] = await Promise.all([
        qaResponse.json(),
        resourceResponse.json(),
        gradebookResponse.json(),
      ]);
      setQa(qaData.items || []);
      setResources(resourceData.resources || []);
      setGradebook(gradebookData);
      setLoadError("");
    } catch {
      setLoadError(zh ? "部分教师数据加载失败，请刷新重试。" : "Some teacher data could not be loaded. Please refresh and try again.");
    } finally {
      setGradebookLoading(false);
    }
  }, [zh]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const visibleStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    if (!gradebook || !query) return gradebook?.students || [];
    return gradebook.students.filter(
      (student) =>
        student.name.toLowerCase().includes(query) ||
        student.studentId.toLowerCase().includes(query),
    );
  }, [gradebook, studentQuery]);

  async function uploadRoster(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRosterMessage("");
    const response = await fetch("/api/teacher/roster/preview", {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    const data = await response.json();
    if (!response.ok) {
      setRosterMessage(data.error);
      return;
    }
    setPreview(data.preview);
  }

  async function confirmRoster() {
    if (
      !preview ||
      !window.confirm(
        zh
          ? "确认执行名单同步？未出现在新名单中的账号会被停用，但历史成绩会保留。"
          : "Apply this roster sync? Missing accounts will be deactivated, while historical results stay intact.",
      )
    ) {
      return;
    }
    const response = await fetch("/api/teacher/roster/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: preview.token }),
    });
    const data = await response.json();
    if (!response.ok) {
      setRosterMessage(data.error);
      return;
    }
    setPreview(null);
    await load();
    setRosterMessage(
      zh
        ? `同步完成：${data.result.active} 个有效账号`
        : `Roster synced: ${data.result.active} active accounts`,
    );
  }

  async function answer(id: number, answerText: string) {
    const response = await fetch(`/api/teacher/qa/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: answerText }),
    });
    if (response.ok) await load();
  }

  async function uploadResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setResourceMessage("");
    setResourceUploading(true);
    try {
      const response = await fetch("/api/teacher/resources", {
        method: "POST",
        body: new FormData(formElement),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setResourceMessage(
          data?.error || (zh ? "上传失败，请检查文件存储服务。" : "Upload failed. Please check the file storage service."),
        );
        return;
      }
      formElement.reset();
      await load();
      setResourceMessage(zh ? "资料上传成功。" : "Resource uploaded successfully.");
    } catch {
      setResourceMessage(
        zh ? "上传失败，服务器暂时无法保存文件。" : "Upload failed because the server could not store the file.",
      );
    } finally {
      setResourceUploading(false);
    }
  }

  return (
    <section className="teacher-tools">
      {loadError && <div className="error-box teacher-tools-message">{loadError}</div>}
      <article className="tool-card">
        <h2>{zh ? "学生名单与账号" : "Roster and accounts"}</h2>
        <p>
          {zh
            ? "上传含“学号”和“姓名”列的 Excel。系统先显示变更，确认后新增账号并停用名单外账号。初始密码为学号加 2605。"
            : "Upload an Excel file with Student ID and Name columns. Review changes before applying. Initial password is the student ID plus 2605."}
        </p>
        <form onSubmit={uploadRoster}>
          <input name="file" type="file" accept=".xls,.xlsx" required />
          <button className="primary-button">
            {zh ? "预览名单变更" : "Preview roster changes"}
          </button>
        </form>
        {rosterMessage && <div className="notice-box">{rosterMessage}</div>}
        {preview && (
          <div className="sync-preview">
            <b>{zh ? "待确认变更" : "Changes awaiting confirmation"}</b>
            <p>
              {zh ? "名单总数" : "Roster total"}: {preview.total} · {zh ? "新增" : "Add"}: {preview.add.length} · {zh ? "更新" : "Update"}: {preview.update.length} · {zh ? "停用" : "Deactivate"}: {preview.deactivate.length} · {zh ? "不变" : "Unchanged"}: {preview.unchanged}
            </p>
            <details>
              <summary>{zh ? "查看详细变更" : "View details"}</summary>
              {preview.add.map((student) => (
                <div key={`a${student.studentId}`}>+ {student.studentId} {student.name}</div>
              ))}
              {preview.update.map((student) => (
                <div key={`u${student.studentId}`}>~ {student.studentId} {student.previousName} → {student.name}</div>
              ))}
              {preview.deactivate.map((student) => (
                <div key={`d${student.studentId}`}>− {student.studentId} {student.name}</div>
              ))}
            </details>
            <button className="primary-button" onClick={confirmRoster}>
              {zh ? "管理员确认并执行" : "Confirm and apply"}
            </button>
          </div>
        )}
      </article>

      <article className="tool-card gradebook-card">
        <div className="gradebook-heading">
          <div>
            <h2>{zh ? "学生成绩册" : "Student gradebook"}</h2>
            <p>
              {zh
                ? "查看正式名单学生的每次测验成绩。— 表示尚未提交；停用账号仍保留历史成绩。"
                : "View every registered student's quiz scores. — means not submitted; inactive accounts retain their history."}
            </p>
          </div>
          <button className="secondary-button" onClick={() => void load()} disabled={gradebookLoading}>
            {gradebookLoading ? (zh ? "加载中…" : "Loading…") : (zh ? "刷新" : "Refresh")}
          </button>
        </div>

        {gradebook && gradebook.students.length > 0 && (
          <div className="gradebook-toolbar">
            <label>
              <span>{zh ? "查找学生" : "Find a student"}</span>
              <input
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder={zh ? "输入姓名或学号" : "Search by name or ID"}
              />
            </label>
            <span>
              {zh ? "当前有效" : "Active"}: {gradebook.students.filter((student) => student.active).length} · {zh ? "全部记录" : "All records"}: {gradebook.students.length}
            </span>
          </div>
        )}

        {gradebookLoading && !gradebook ? (
          <p className="empty-state">{zh ? "正在加载成绩册…" : "Loading gradebook…"}</p>
        ) : !gradebook || gradebook.students.length === 0 ? (
          <div className="empty-state">
            <b>{zh ? "名单中还没有学生" : "No students in the roster yet"}</b>
            <p>{zh ? "请先在上方上传并确认学生名单。" : "Upload and confirm a roster above first."}</p>
          </div>
        ) : (
          <div className="gradebook-scroll">
            <table className="gradebook-table">
              <thead>
                <tr>
                  <th>{zh ? "姓名" : "Name"}</th>
                  <th>{zh ? "学号" : "Student ID"}</th>
                  <th>{zh ? "状态" : "Status"}</th>
                  {gradebook.quizzes.map((quiz) => (
                    <th key={quiz.id} title={quiz.title}>
                      <b>{quiz.title}</b>
                      <small>{quiz.code} · {quiz.total} {zh ? "题" : "questions"}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student) => (
                  <tr key={student.studentId} className={student.active ? "" : "inactive-student"}>
                    <th scope="row">{student.name}</th>
                    <td>{student.studentId}</td>
                    <td>
                      <span className={student.active ? "roster-status active" : "roster-status inactive"}>
                        {student.active ? (zh ? "有效" : "Active") : (zh ? "已停用" : "Inactive")}
                      </span>
                    </td>
                    {gradebook.quizzes.map((quiz) => {
                      const result = student.scores.find((score) => score.quizId === quiz.id);
                      return (
                        <td key={quiz.id} title={result ? new Date(result.submittedAt).toLocaleString() : undefined}>
                          {result ? <b>{result.score} / {result.total}</b> : <span className="missing-score">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleStudents.length === 0 && (
              <p className="empty-state">{zh ? "没有匹配的学生。" : "No matching students."}</p>
            )}
          </div>
        )}
      </article>

      <article className="tool-card">
        <h2>{zh ? "学生问答" : "Student Q&A"}</h2>
        {qa.length === 0 ? (
          <p>{zh ? "暂无问题" : "No questions yet"}</p>
        ) : (
          qa.map((item) => (
            <div className="qa-item" key={item.id}>
              <b>{item.studentName}{item.studentId ? ` · ${item.studentId}` : ""}</b>
              <p>{item.question}</p>
              {item.imageKey && (
                <Image
                  src={`/api/qa/${item.id}/image`}
                  alt="Question attachment"
                  width={640}
                  height={420}
                  unoptimized
                />
              )}
              <textarea
                defaultValue={item.answer || ""}
                id={`answer-${item.id}`}
                placeholder={zh ? "输入回答" : "Write an answer"}
              />
              <button
                className="secondary-button"
                onClick={() =>
                  answer(
                    item.id,
                    (document.getElementById(`answer-${item.id}`) as HTMLTextAreaElement).value,
                  )
                }
              >
                {zh ? "保存回答" : "Save answer"}
              </button>
            </div>
          ))
        )}
      </article>

      <article className="tool-card">
        <h2>{zh ? "课程资料库" : "Course library"}</h2>
        <form onSubmit={uploadResource}>
          <label>
            {zh ? "资料标题" : "Title"}
            <input name="title" />
          </label>
          <input
            name="file"
            type="file"
            accept=".ppt,.pptx,.pdf,.doc,.docx,.xls,.xlsx,.md,.markdown,.jpg,.jpeg,.png"
            required
          />
          <small>{zh ? "单个文件最大 10 MB" : "Maximum file size: 10 MB"}</small>
          <button className="primary-button" disabled={resourceUploading}>
            {resourceUploading ? (zh ? "正在上传…" : "Uploading…") : (zh ? "上传资料" : "Upload resource")}
          </button>
        </form>
        {resourceMessage && <div className="notice-box" aria-live="polite">{resourceMessage}</div>}
        {resources.map((item) => (
          <div className="resource-row" key={item.id}>
            <span>
              <b>{item.title}</b>
              <small>{item.filename} · {(item.size / 1024 / 1024).toFixed(1)} MB</small>
            </span>
            <button
              onClick={async () => {
                if (confirm(zh ? "删除这份资料？" : "Delete this resource?")) {
                  await fetch(`/api/teacher/resources/${item.id}`, { method: "DELETE" });
                  await load();
                }
              }}
            >
              {zh ? "删除" : "Delete"}
            </button>
          </div>
        ))}
      </article>
    </section>
  );
}
