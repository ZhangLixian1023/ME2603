"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type QuizSummary = {
  id: number;
  code: string;
  title: string;
  description: string;
  isPublished: boolean;
  questionCount: number;
  submissionCount: number;
};

type DraftQuestion = { prompt: string; options: string[]; correctIndex: number };
type Submission = { id: number; studentId: string; nickname: string; score: number; total: number; submittedAt: string };

const blankQuestion = (): DraftQuestion => ({ prompt: "", options: ["", "", "", ""], correctIndex: 0 });

export default function TeacherDashboard() {
  const [auth, setAuth] = useState<"loading" | "in" | "out">("loading");
  const [password, setPassword] = useState("");
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()]);
  const [activeResults, setActiveResults] = useState<number | null>(null);
  const [results, setResults] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadQuizzes = useCallback(async () => {
    const response = await fetch("/api/teacher/quizzes", { cache: "no-store" });
    if (response.status === 401) { setAuth("out"); return; }
    const data = await response.json();
    setQuizzes(data.quizzes || []);
    setAuth("in");
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { loadQuizzes().catch(() => setAuth("out")); }, 0);
    return () => window.clearTimeout(initial);
  }, [loadQuizzes]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const response = await fetch("/api/teacher/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) { setError(data.error || "登录失败"); return; }
    setPassword(""); setAuth("in"); await loadQuizzes();
  }

  async function logout() {
    await fetch("/api/teacher/logout", { method: "POST" });
    setAuth("out"); setQuizzes([]);
  }

  function updateQuestion(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) => current.map((question, index) => index === questionIndex ? {
      ...question,
      options: question.options.map((option, currentOption) => currentOption === optionIndex ? value : option),
    } : question));
  }

  function openCreate() {
    setEditingId(null); setTitle(""); setDescription(""); setQuestions([blankQuestion()]); setError(""); setCreating(true);
  }

  async function openEdit(id: number) {
    setBusy(true); setError("");
    const response = await fetch(`/api/teacher/quizzes/${id}`, { cache: "no-store" });
    const data = await response.json(); setBusy(false);
    if (!response.ok) { setError(data.error || "读取测验失败"); return; }
    setEditingId(id); setTitle(data.quiz.title); setDescription(data.quiz.description);
    setQuestions(data.quiz.questions.map((question: DraftQuestion) => ({ prompt: question.prompt, options: question.options, correctIndex: question.correctIndex })));
    setCreating(true);
  }

  async function saveQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const published = submitter?.value === "publish";
    const response = await fetch(editingId ? `/api/teacher/quizzes/${editingId}` : "/api/teacher/quizzes", {
      method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, questions, published }),
    });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) { setError(data.error || "保存失败"); return; }
    setTitle(""); setDescription(""); setQuestions([blankQuestion()]); setCreating(false); setEditingId(null);
    setNotice(editingId ? "测验内容已更新。" : `测验已创建，课堂代码是 ${data.quiz.code}。${published ? "现在学生可以进入。" : "发布后学生即可进入。"}`);
    await loadQuizzes();
  }

  async function removeQuiz(quiz: QuizSummary) {
    if (!window.confirm(`确定删除“${quiz.title}”吗？它的答卷也会一并删除。`)) return;
    const response = await fetch(`/api/teacher/quizzes/${quiz.id}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json(); setError(data.error || "删除失败"); return; }
    setNotice("测验已删除。"); if (activeResults === quiz.id) setActiveResults(null); await loadQuizzes();
  }

  async function togglePublish(quiz: QuizSummary) {
    setBusy(true); setError("");
    const response = await fetch(`/api/teacher/quizzes/${quiz.id}/publish`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: !quiz.isPublished }),
    });
    setBusy(false);
    if (!response.ok) { const data = await response.json(); setError(data.error || "操作失败"); return; }
    await loadQuizzes();
  }

  async function showResults(id: number) {
    setActiveResults(id); setBusy(true);
    const response = await fetch(`/api/teacher/quizzes/${id}/results`, { cache: "no-store" });
    const data = await response.json();
    setBusy(false);
    if (!response.ok) { setError(data.error || "读取成绩失败"); return; }
    setResults(data.submissions || []);
  }

  async function resetSubmission(id: number) {
    if (!window.confirm("删除后，这个学号可以重新提交。确定吗？")) return;
    const response = await fetch(`/api/teacher/submissions/${id}`, { method: "DELETE" });
    if (!response.ok) { setError("删除失败"); return; }
    if (activeResults) await showResults(activeResults);
    await loadQuizzes();
  }

  async function copyLink(code: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/quiz/${code}`);
    setNotice("学生答题链接已复制。");
  }

  if (auth === "loading") return <main className="center-message"><div className="brand-mark">答</div><h1>正在打开教师后台…</h1></main>;

  if (auth === "out") return (
    <main className="teacher-login-shell">
      <Link className="brand" href="/"><span className="brand-mark">答</span><span>答答看</span></Link>
      <section className="login-panel">
        <div className="login-art"><span>TEACHER<br />SPACE</span><div className="chalk-circle">✦</div><p>创建、发布、查看<br />一站完成。</p></div>
        <form onSubmit={login} className="login-form">
          <span className="eyebrow"><i /> 教师专属入口</span>
          <h1>欢迎回来</h1><p>请输入教师密码进入管理后台。</p>
          <label>教师密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" autoFocus /></label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-button wide" disabled={busy}>{busy ? "登录中…" : "进入后台 →"}</button>
          <small className="demo-password">密码由网站管理员设置</small>
        </form>
      </section>
    </main>
  );

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <Link className="brand inverse-brand" href="/"><span className="brand-mark">答</span><span>答答看</span></Link>
        <nav><button className="active">▦ <span>我的测验</span></button><button onClick={openCreate}>＋ <span>新建测验</span></button></nav>
        <button className="logout-button" onClick={logout}>↪ <span>退出登录</span></button>
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-head"><div><span className="tiny-label">教师工作台</span><h1>我的测验</h1><p>创建课堂小测，发布后分享代码给学生。</p></div><button className="primary-button" onClick={openCreate}>＋ 新建测验</button></header>
        {notice && <div className="notice-box">✓ {notice}<button onClick={() => setNotice("")}>×</button></div>}
        {error && <div className="error-box">{error}</div>}
        <section className="stats-row">
          <article><span>测验总数</span><strong>{quizzes.length}</strong><i>份</i></article>
          <article><span>已发布</span><strong>{quizzes.filter((quiz) => quiz.isPublished).length}</strong><i>份</i></article>
          <article><span>收到答卷</span><strong>{quizzes.reduce((sum, quiz) => sum + Number(quiz.submissionCount), 0)}</strong><i>份</i></article>
        </section>
        <section className="quiz-table-card">
          <div className="table-title"><h2>全部测验</h2><span>{quizzes.length} 份</span></div>
          {quizzes.map((quiz) => (
            <article className="quiz-row" key={quiz.id}>
              <div className="quiz-icon">{quiz.title.slice(0, 1)}</div>
              <div className="quiz-info"><h3>{quiz.title}</h3><p>代码 <b>{quiz.code}</b> · {quiz.questionCount} 题 · {quiz.submissionCount} 人提交</p></div>
              <span className={quiz.isPublished ? "status published" : "status draft"}>{quiz.isPublished ? "已发布" : "草稿"}</span>
              <div className="row-actions">
                {quiz.isPublished && <><button onClick={() => copyLink(quiz.code)}>复制链接</button><Link href={`/quiz/${quiz.code}/leaderboard`} target="_blank">排行榜</Link></>}
                <button onClick={() => openEdit(quiz.id)} disabled={busy}>编辑</button>
                <button onClick={() => showResults(quiz.id)}>成绩</button>
                <a href={`/api/teacher/quizzes/${quiz.id}/export`}>导出 CSV</a>
                <button className={quiz.isPublished ? "outline-danger" : "outline-success"} disabled={busy} onClick={() => togglePublish(quiz)}>{quiz.isPublished ? "下线" : "发布"}</button>
                <button className="outline-danger" onClick={() => removeQuiz(quiz)}>删除</button>
              </div>
            </article>
          ))}
        </section>

        {activeResults !== null && (
          <section className="results-panel">
            <div className="modal-head"><div><span className="tiny-label">教师可见</span><h2>学生成绩</h2></div><button onClick={() => setActiveResults(null)}>×</button></div>
            {busy ? <p className="empty-state">读取中…</p> : results.length === 0 ? <div className="empty-state"><b>还没有学生提交</b><p>发布并分享课堂代码后，成绩会出现在这里。</p></div> : (
              <div className="results-table"><div className="results-tr header"><span>昵称</span><span>学号</span><span>正确题数</span><span>操作</span></div>{results.map((item) => <div className="results-tr" key={item.id}><strong>{item.nickname}</strong><span>{item.studentId}</span><b>{item.score} / {item.total}</b><button onClick={() => resetSubmission(item.id)}>允许重答</button></div>)}</div>
            )}
          </section>
        )}
      </div>

      {creating && (
        <div className="modal-backdrop">
          <section className="create-modal">
            <div className="modal-head"><div><span className="tiny-label">{editingId ? "EDIT QUIZ" : "NEW QUIZ"}</span><h2>{editingId ? "编辑测验" : "创建新测验"}</h2></div><button onClick={() => setCreating(false)}>×</button></div>
            <form onSubmit={saveQuiz}>
              <div className="form-grid"><label>测验标题<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：第 3 周课堂小测" maxLength={80} autoFocus /></label><label>简短说明（可选）<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="告诉学生这次会考什么" maxLength={240} /></label></div>
              <div className="question-editor-list">
                {questions.map((question, questionIndex) => (
                  <article className="question-editor" key={questionIndex}>
                    <div className="editor-title"><span>第 {questionIndex + 1} 题</span>{questions.length > 1 && <button type="button" onClick={() => setQuestions((current) => current.filter((_, index) => index !== questionIndex))}>删除</button>}</div>
                    <input className="prompt-input" value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} placeholder="输入题目内容" />
                    <div className="option-edit-grid">
                      {question.options.map((option, optionIndex) => (
                        <label className={question.correctIndex === optionIndex ? "edit-option answer" : "edit-option"} key={optionIndex}>
                          <input type="radio" name={`correct-${questionIndex}`} checked={question.correctIndex === optionIndex} onChange={() => updateQuestion(questionIndex, { correctIndex: optionIndex })} />
                          <span>{String.fromCharCode(65 + optionIndex)}</span>
                          <input value={option} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`选项 ${String.fromCharCode(65 + optionIndex)}`} />
                        </label>
                      ))}
                    </div>
                    <small className="answer-tip">选中圆点标记正确答案</small>
                  </article>
                ))}
              </div>
              {error && <div className="error-box">{error}</div>}
              <div className="create-actions">
                <button className="secondary-button" type="button" onClick={() => setQuestions((current) => [...current, blankQuestion()])}>＋ 添加题目</button>
                <div className="save-actions">
                  {!editingId && <button className="secondary-button" name="intent" value="draft" disabled={busy}>{busy ? "保存中…" : "保存草稿"}</button>}
                  <button className="primary-button" name="intent" value={editingId ? "edit" : "publish"} disabled={busy}>{busy ? "保存中…" : editingId ? "保存修改" : "保存并发布"}</button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
