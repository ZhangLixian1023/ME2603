"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import Brand from "./Brand";
import BackHomeLink from "./BackHomeLink";
import LanguageToggle from "./LanguageToggle";
import { localizeApiError, useLanguage } from "./LanguageProvider";
import TeacherTools from "./TeacherTools";

type QuizSummary = { id: number; code: string; title: string; description: string; isPublished: boolean; questionCount: number; submissionCount: number };
type DraftQuestion = { prompt: string; options: string[]; correctIndex: number };
type Submission = { id: number; studentId: string; nickname: string; score: number; total: number; submittedAt: string };
type Statistics = { submissionCount:number; averageScore:number; averageAccuracy:number; questions:Array<{questionId:number;prompt:string;correctCount:number;responseCount:number;accuracy:number}> };

const blankQuestion = (): DraftQuestion => ({ prompt: "", options: ["", "", "", ""], correctIndex: 0 });

export default function TeacherDashboard() {
  const { language, t } = useLanguage();
  const [auth, setAuth] = useState<"loading" | "in" | "out">("loading");
  const [password, setPassword] = useState("");
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [quizCode, setQuizCode] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([blankQuestion()]);
  const [activeResults, setActiveResults] = useState<number | null>(null);
  const [results, setResults] = useState<Submission[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadQuizzes = useCallback(async () => {
    const response = await fetch("/api/teacher/quizzes", { cache: "no-store" });
    if (response.status === 401) { setAuth("out"); return; }
    const data = await response.json(); setQuizzes(data.quizzes || []); setAuth("in");
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { loadQuizzes().catch(() => setAuth("out")); }, 0);
    return () => window.clearTimeout(initial);
  }, [loadQuizzes]);

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/teacher/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await response.json(); setBusy(false);
    if (!response.ok) { setError(localizeApiError(data.error, language, "signInFailed")); return; }
    setPassword(""); setAuth("in"); await loadQuizzes();
  }

  async function logout() { await fetch("/api/teacher/logout", { method: "POST" }); setAuth("out"); setQuizzes([]); }
  function updateQuestion(index: number, patch: Partial<DraftQuestion>) { setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question)); }
  function updateOption(questionIndex: number, optionIndex: number, value: string) { setQuestions((current) => current.map((question, index) => index === questionIndex ? { ...question, options: question.options.map((option, currentOption) => currentOption === optionIndex ? value : option) } : question)); }
  function openCreate() { setEditingId(null); setQuizCode(""); setTitle(""); setDescription(""); setQuestions([blankQuestion()]); setError(""); setCreating(true); }

  async function openEdit(id: number) {
    setBusy(true); setError("");
    const response = await fetch(`/api/teacher/quizzes/${id}`, { cache: "no-store" });
    const data = await response.json(); setBusy(false);
    if (!response.ok) { setError(localizeApiError(data.error, language, "readQuizFailed")); return; }
    setEditingId(id); setQuizCode(""); setTitle(data.quiz.title); setDescription(data.quiz.description);
    setQuestions(data.quiz.questions.map((question: DraftQuestion) => ({ prompt: question.prompt, options: question.options, correctIndex: question.correctIndex })));
    setCreating(true);
  }

  async function saveQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const published = submitter?.value === "publish";
    const response = await fetch(editingId ? `/api/teacher/quizzes/${editingId}` : "/api/teacher/quizzes", { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: editingId ? undefined : quizCode, title, description, questions, published }) });
    const data = await response.json(); setBusy(false);
    if (!response.ok) { setError(localizeApiError(data.error, language, "saveFailed")); return; }
    setQuizCode(""); setTitle(""); setDescription(""); setQuestions([blankQuestion()]); setCreating(false); setEditingId(null);
    if (editingId) setNotice(t("quizUpdated"));
    else setNotice(t("quizCreated").replace("{code}", data.quiz.code).replace("{status}", published ? t("studentsCanEnter") : t("publishToOpen")));
    await loadQuizzes();
  }

  async function removeQuiz(quiz: QuizSummary) {
    if (!window.confirm(t("deleteQuizConfirm").replace("{title}", quiz.title))) return;
    const response = await fetch(`/api/teacher/quizzes/${quiz.id}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json(); setError(localizeApiError(data.error, language, "deleteFailed")); return; }
    setNotice(t("quizDeleted")); if (activeResults === quiz.id) setActiveResults(null); await loadQuizzes();
  }

  async function togglePublish(quiz: QuizSummary) {
    setBusy(true); setError("");
    const response = await fetch(`/api/teacher/quizzes/${quiz.id}/publish`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: !quiz.isPublished }) });
    setBusy(false);
    if (!response.ok) { const data = await response.json(); setError(localizeApiError(data.error, language, "operationFailed")); return; }
    await loadQuizzes();
  }

  async function showResults(id: number) {
    setActiveResults(id); setBusy(true);
    const response = await fetch(`/api/teacher/quizzes/${id}/results`, { cache: "no-store" });
    const data = await response.json(); setBusy(false);
    if (!response.ok) { setError(localizeApiError(data.error, language, "readResultsFailed")); return; }
    setResults(data.submissions || []);
    setStatistics(data.statistics || null);
  }

  async function resetSubmission(id: number) {
    if (!window.confirm(t("retryConfirm"))) return;
    const response = await fetch(`/api/teacher/submissions/${id}`, { method: "DELETE" });
    if (!response.ok) { setError(t("deleteFailed")); return; }
    if (activeResults) await showResults(activeResults); await loadQuizzes();
  }

  async function copyLink(code: string) { await navigator.clipboard.writeText(`${window.location.origin}/quiz/${code}`); setNotice(t("linkCopied")); }

  if (auth === "loading") return <main className="center-message"><LanguageToggle /><div className="brand-mark">{language === "zh" ? "答" : "Q"}</div><h1>{t("openingTeacher")}</h1></main>;

  if (auth === "out") return (
    <main className="teacher-login-shell">
      <div className="simple-header"><Brand /><div className="header-actions"><BackHomeLink /><LanguageToggle /></div></div>
      <section className="login-panel">
        <div className="login-art"><span>TEACHER<br />SPACE</span><div className="chalk-circle">✦</div><p>{t("teacherSpaceMessage")}</p></div>
        <form onSubmit={login} className="login-form">
          <span className="eyebrow"><i /> {t("teacherAccess")}</span><h1>{t("welcomeBack")}</h1><p>{t("teacherLoginDetail")}</p>
          <label>{t("teacherPassword")}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("passwordPlaceholder")} autoFocus /></label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-button wide" disabled={busy}>{busy ? t("signingIn") : t("enterDashboard")}</button>
          <small className="demo-password">{t("passwordManaged")}</small>
        </form>
      </section>
    </main>
  );

  return (
    <main className="dashboard-shell">
      <aside className="sidebar">
        <Brand inverse />
        <LanguageToggle inverse />
        <nav><BackHomeLink inverse /><button className="active">▦ <span>{t("myQuizzes")}</span></button><button onClick={openCreate}>＋ <span>{t("newQuiz")}</span></button></nav>
        <button className="logout-button" onClick={logout}>↪ <span>{t("logout")}</span></button>
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-head"><div><span className="tiny-label">{t("teacherDashboard")}</span><h1>{t("myQuizzes")}</h1><p>{t("dashboardDetail")}</p></div><button className="primary-button" onClick={openCreate}>＋ {t("newQuiz")}</button></header>
        {notice && <div className="notice-box">✓ {notice}<button onClick={() => setNotice("")}>×</button></div>}
        {error && <div className="error-box">{error}</div>}
        <section className="stats-row">
          <article><span>{t("totalQuizzes")}</span><strong>{quizzes.length}</strong><i>{t("quizzesUnit")}</i></article>
          <article><span>{t("published")}</span><strong>{quizzes.filter((quiz) => quiz.isPublished).length}</strong><i>{t("quizzesUnit")}</i></article>
          <article><span>{t("submissionsReceived")}</span><strong>{quizzes.reduce((sum, quiz) => sum + Number(quiz.submissionCount), 0)}</strong><i>{t("submissionsUnit")}</i></article>
        </section>
        <section className="quiz-table-card">
          <div className="table-title"><h2>{t("allQuizzes")}</h2><span>{quizzes.length} {t("quizzesUnit")}</span></div>
          {quizzes.map((quiz) => (
            <article className="quiz-row" key={quiz.id}>
              <div className="quiz-icon">{quiz.title.slice(0, 1)}</div>
              <div className="quiz-info"><h3>{quiz.title}</h3><p>{t("code")} <b>{quiz.code}</b> · {quiz.questionCount} {t("questionsShort")} · {quiz.submissionCount} {t("submittedShort")}</p></div>
              <span className={quiz.isPublished ? "status published" : "status draft"}>{quiz.isPublished ? t("published") : t("draft")}</span>
              <div className="row-actions">
                {quiz.isPublished && <><button onClick={() => copyLink(quiz.code)}>{t("copyLink")}</button><Link href={`/quiz/${quiz.code}/leaderboard`} target="_blank">{t("leaderboard")}</Link></>}
                <button onClick={() => openEdit(quiz.id)} disabled={busy}>{t("edit")}</button><button onClick={() => showResults(quiz.id)}>{t("results")}</button><a href={`/api/teacher/quizzes/${quiz.id}/export`}>{t("exportCsv")}</a>
                <button className={quiz.isPublished ? "outline-danger" : "outline-success"} disabled={busy} onClick={() => togglePublish(quiz)}>{quiz.isPublished ? t("takeOffline") : t("publish")}</button>
                <button className="outline-danger" onClick={() => removeQuiz(quiz)}>{t("delete")}</button>
              </div>
            </article>
          ))}
        </section>
        {activeResults !== null && (
          <section className="results-panel">
            <div className="modal-head"><div><span className="tiny-label">{t("teacherVisible")}</span><h2>{t("studentResults")}</h2></div><button onClick={() => setActiveResults(null)}>×</button></div>
            {statistics && <div className="analytics-summary"><article><span>{language==='zh'?'提交人数':'Submissions'}</span><strong>{statistics.submissionCount}</strong></article><article><span>{language==='zh'?'平均正确题数':'Average score'}</span><strong>{statistics.averageScore.toFixed(1)}</strong></article><article><span>{language==='zh'?'平均正确率':'Average accuracy'}</span><strong>{(statistics.averageAccuracy*100).toFixed(1)}%</strong></article></div>}
            {statistics && statistics.questions.length>0 && <div className="question-stats">{statistics.questions.map((question,index)=><div key={question.questionId}><span>{index+1}. {question.prompt}</span><b>{(question.accuracy*100).toFixed(1)}% ({question.correctCount}/{question.responseCount})</b></div>)}</div>}
            {busy ? <p className="empty-state">{t("loading")}</p> : results.length === 0 ? <div className="empty-state"><b>{t("noSubmissions")}</b><p>{t("noSubmissionsDetail")}</p></div> : (<div className="results-table"><div className="results-tr header"><span>{t("nickname")}</span><span>{t("studentId")}</span><span>{t("correctAnswers")}</span><span>{t("action")}</span></div>{results.map((item) => <div className="results-tr" key={item.id}><strong>{item.nickname}</strong><span>{item.studentId}</span><b>{item.score} / {item.total}</b><button onClick={() => resetSubmission(item.id)}>{t("allowRetry")}</button></div>)}</div>)}
          </section>
        )}
        <TeacherTools />
      </div>

      {creating && (
        <div className="modal-backdrop"><section className="create-modal">
          <div className="modal-head"><div><span className="tiny-label">{editingId ? "EDIT QUIZ" : "NEW QUIZ"}</span><h2>{editingId ? t("editQuiz") : t("createQuiz")}</h2></div><button onClick={() => setCreating(false)}>×</button></div>
          <form onSubmit={saveQuiz}>
            {!editingId && <label className="custom-code-field">{t("customQuizCode")}<input value={quizCode} onChange={(event) => setQuizCode(event.target.value.replace(/\s/g, "").toUpperCase())} placeholder={t("customQuizCodePlaceholder")} minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,23}" autoComplete="off" spellCheck={false} /><small>{t("customQuizCodeHint")}</small></label>}
            <div className="form-grid"><label>{t("quizTitle")}<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("quizTitlePlaceholder")} maxLength={80} autoFocus /></label><label>{t("shortDescription")}<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("descriptionPlaceholder")} maxLength={240} /></label></div>
            <div className="question-editor-list">{questions.map((question, questionIndex) => (
              <article className="question-editor" key={questionIndex}>
                <div className="editor-title"><span>{language === "zh" ? `第 ${questionIndex + 1} 题` : `${t("question")} ${questionIndex + 1}`}</span>{questions.length > 1 && <button type="button" onClick={() => setQuestions((current) => current.filter((_, index) => index !== questionIndex))}>{t("remove")}</button>}</div>
                <input className="prompt-input" value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} placeholder={t("questionPrompt")} />
                <div className="option-edit-grid">{question.options.map((option, optionIndex) => (
                  <label className={question.correctIndex === optionIndex ? "edit-option answer" : "edit-option"} key={optionIndex}>
                    <input type="radio" name={`correct-${questionIndex}`} checked={question.correctIndex === optionIndex} onChange={() => updateQuestion(questionIndex, { correctIndex: optionIndex })} /><span>{String.fromCharCode(65 + optionIndex)}</span>
                    <input value={option} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`${t("option")} ${String.fromCharCode(65 + optionIndex)}`} />
                  </label>
                ))}</div><small className="answer-tip">{t("correctAnswerTip")}</small>
              </article>
            ))}</div>
            {error && <div className="error-box">{error}</div>}
            <div className="create-actions"><button className="secondary-button" type="button" onClick={() => setQuestions((current) => [...current, blankQuestion()])}>＋ {t("addQuestion")}</button><div className="save-actions">
              {!editingId && <button className="secondary-button" name="intent" value="draft" disabled={busy}>{busy ? t("saving") : t("saveDraft")}</button>}
              <button className="primary-button" name="intent" value={editingId ? "edit" : "publish"} disabled={busy}>{busy ? t("saving") : editingId ? t("saveChanges") : t("savePublish")}</button>
            </div></div>
          </form>
        </section></div>
      )}
    </main>
  );
}
