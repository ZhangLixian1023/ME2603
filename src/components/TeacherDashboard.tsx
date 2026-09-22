"use client";

import Link from "next/link";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import Brand from "./Brand";
import BackHomeLink from "./BackHomeLink";
import LanguageToggle from "./LanguageToggle";
import MathText from "./MathText";
import { localizeApiError, useLanguage } from "./LanguageProvider";
import TeacherTools from "./TeacherTools";

type QuizSummary = { id: number; code: string; title: string; description: string; isPublished: boolean; questionCount: number; submissionCount: number };
type DraftQuestion = { prompt: string; options: string[]; correctIndex: number; imageKey: string | null; imageFile: File | null; imagePreview: string | null };
type Submission = { id: number; studentId: string; nickname: string; score: number; total: number; submittedAt: string };
type Statistics = { submissionCount:number; averageScore:number; averageAccuracy:number; questions:Array<{questionId:number;prompt:string;correctCount:number;responseCount:number;accuracy:number}> };
type QuizProgress = { startedCount:number; unsubmittedCount:number; submittedCount:number; timedOutCount:number; enabled:boolean; refreshedAt:string };

const blankQuestion = (): DraftQuestion => ({ prompt: "", options: ["", "", "", ""], correctIndex: 0, imageKey: null, imageFile: null, imagePreview: null });

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
  const [quizProgress, setQuizProgress] = useState<QuizProgress | null>(null);
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

  const loadQuizProgress = useCallback(async (id: number) => {
    const response = await fetch(`/api/teacher/quizzes/${id}/progress`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setQuizProgress(data.progress || null);
  }, []);

  useEffect(() => {
    if (activeResults === null) return;
    const initial = window.setTimeout(() => void loadQuizProgress(activeResults), 0);
    const interval = window.setInterval(() => void loadQuizProgress(activeResults), 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [activeResults, loadQuizProgress]);

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
  function releasePreview(question: DraftQuestion) { if (question.imagePreview?.startsWith("blob:")) URL.revokeObjectURL(question.imagePreview); }
  function closeEditor() { questions.forEach(releasePreview); setCreating(false); }
  function openCreate() { questions.forEach(releasePreview); setEditingId(null); setQuizCode(""); setTitle(""); setDescription(""); setQuestions([blankQuestion()]); setError(""); setCreating(true); }

  function selectQuestionImage(index: number, file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 || (!/^image\/(jpeg|png)$/.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name))) {
      setError(language === "zh" ? "题目图片须为 JPG、JPEG 或 PNG，且不能超过 5 MB。" : "Question images must be JPG, JPEG, or PNG and no larger than 5 MB.");
      return;
    }
    const previous = questions[index];
    if (previous) releasePreview(previous);
    updateQuestion(index, { imageFile: file, imagePreview: URL.createObjectURL(file) });
    setError("");
  }

  function removeQuestionImage(index: number) {
    const question = questions[index];
    if (question) releasePreview(question);
    updateQuestion(index, { imageKey: null, imageFile: null, imagePreview: null });
  }

  function removeQuestion(index: number) {
    const question = questions[index];
    if (question) releasePreview(question);
    setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index));
  }

  async function openEdit(id: number) {
    setBusy(true); setError("");
    const response = await fetch(`/api/teacher/quizzes/${id}`, { cache: "no-store" });
    const data = await response.json(); setBusy(false);
    if (!response.ok) { setError(localizeApiError(data.error, language, "readQuizFailed")); return; }
    setEditingId(id); setQuizCode(""); setTitle(data.quiz.title); setDescription(data.quiz.description);
    questions.forEach(releasePreview);
    setQuestions(data.quiz.questions.map((question: DraftQuestion) => ({
      prompt: question.prompt,
      options: question.options,
      correctIndex: question.correctIndex,
      imageKey: question.imageKey || null,
      imageFile: null,
      imagePreview: question.imageKey ? `/api/teacher/question-images?key=${encodeURIComponent(question.imageKey)}` : null,
    })));
    setCreating(true);
  }

  async function saveQuiz(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const published = submitter?.value === "publish";
    const uploadedKeys: string[] = [];
    const wasEditing = editingId !== null;
    try {
      const preparedQuestions = [];
      for (const question of questions) {
        let imageKey = question.imageKey;
        if (question.imageFile) {
          const form = new FormData();
          form.set("image", question.imageFile);
          const uploadResponse = await fetch("/api/teacher/question-images", { method: "POST", body: form });
          const uploadData = await uploadResponse.json();
          if (!uploadResponse.ok) throw new Error(language === "zh" ? uploadData.error || "题目图片上传失败" : "Question image upload failed.");
          const uploadedKey = String(uploadData.imageKey);
          imageKey = uploadedKey;
          uploadedKeys.push(uploadedKey);
        }
        preparedQuestions.push({ prompt: question.prompt, options: question.options, correctIndex: question.correctIndex, imageKey });
      }

      const response = await fetch(editingId ? `/api/teacher/quizzes/${editingId}` : "/api/teacher/quizzes", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: editingId ? undefined : quizCode, title, description, questions: preparedQuestions, published }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(localizeApiError(data.error, language, "saveFailed"));

      questions.forEach(releasePreview);
      setQuizCode(""); setTitle(""); setDescription(""); setQuestions([blankQuestion()]); setCreating(false); setEditingId(null);
      if (wasEditing) setNotice(t("quizUpdated"));
      else setNotice(t("quizCreated").replace("{code}", data.quiz.code).replace("{status}", published ? t("studentsCanEnter") : t("publishToOpen")));
      await loadQuizzes();
    } catch (reason) {
      await Promise.allSettled(uploadedKeys.map((imageKey) => fetch("/api/teacher/question-images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageKey }) })));
      setError(reason instanceof Error ? reason.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
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
    setActiveResults(id); setQuizProgress(null); setBusy(true);
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
              <div className="quiz-info"><h3><MathText>{quiz.title}</MathText></h3><p>{t("code")} <b>{quiz.code}</b> · {quiz.questionCount} {t("questionsShort")} · {quiz.submissionCount} {t("submittedShort")}</p></div>
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
            <div className="modal-head"><div><span className="tiny-label">{t("teacherVisible")}</span><h2>{t("studentResults")}</h2></div><button onClick={() => { setActiveResults(null); setQuizProgress(null); }}>×</button></div>
            {quizProgress && <div className="live-progress-summary"><div><span>{language === "zh" ? "未提交人数 / 已开始人数" : "Not submitted / Started"}</span><strong>{quizProgress.unsubmittedCount} / {quizProgress.startedCount}</strong></div><div><span>{language === "zh" ? "已提交" : "Submitted"}</span><strong>{quizProgress.submittedCount}</strong></div><div><span>{language === "zh" ? "其中超时提交" : "Auto-submitted"}</span><strong>{quizProgress.timedOutCount}</strong></div><small>{language === "zh" ? "每 30 秒刷新；满 5 人后启用 40% 自动延时规则" : "Updates every 30 seconds; the 40% extension rule activates after 5 students start"}</small></div>}
            {statistics && <div className="analytics-summary"><article><span>{language==='zh'?'提交人数':'Submissions'}</span><strong>{statistics.submissionCount}</strong></article><article><span>{language==='zh'?'平均正确题数':'Average score'}</span><strong>{statistics.averageScore.toFixed(1)}</strong></article><article><span>{language==='zh'?'平均正确率':'Average accuracy'}</span><strong>{(statistics.averageAccuracy*100).toFixed(1)}%</strong></article></div>}
            {statistics && statistics.questions.length>0 && <div className="question-stats">{statistics.questions.map((question,index)=><div key={question.questionId}><span>{index+1}. {question.prompt ? <MathText>{question.prompt}</MathText> : (language === "zh" ? "图片题" : "Image question")}</span><b>{(question.accuracy*100).toFixed(1)}% ({question.correctCount}/{question.responseCount})</b></div>)}</div>}
            {busy ? <p className="empty-state">{t("loading")}</p> : results.length === 0 ? <div className="empty-state"><b>{t("noSubmissions")}</b><p>{t("noSubmissionsDetail")}</p></div> : (<div className="results-table"><div className="results-tr header"><span>{t("nickname")}</span><span>{t("studentId")}</span><span>{t("correctAnswers")}</span><span>{t("action")}</span></div>{results.map((item) => <div className="results-tr" key={item.id}><strong>{item.nickname}</strong><span>{item.studentId}</span><b>{item.score} / {item.total}</b><button onClick={() => resetSubmission(item.id)}>{t("allowRetry")}</button></div>)}</div>)}
          </section>
        )}
        <TeacherTools />
      </div>

      {creating && (
        <div className="modal-backdrop"><section className="create-modal">
          <div className="modal-head"><div><span className="tiny-label">{editingId ? "EDIT QUIZ" : "NEW QUIZ"}</span><h2>{editingId ? t("editQuiz") : t("createQuiz")}</h2></div><button onClick={closeEditor}>×</button></div>
          <form onSubmit={saveQuiz}>
            {!editingId && <label className="custom-code-field">{t("customQuizCode")}<input value={quizCode} onChange={(event) => setQuizCode(event.target.value.replace(/\s/g, "").toUpperCase())} placeholder={t("customQuizCodePlaceholder")} minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,23}" autoComplete="off" spellCheck={false} /><small>{t("customQuizCodeHint")}</small></label>}
            <div className="form-grid"><label>{t("quizTitle")}<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("quizTitlePlaceholder")} maxLength={80} autoFocus /><small>{language === "zh" ? "支持 LaTeX" : "LaTeX supported"}</small></label><label>{t("shortDescription")}<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("descriptionPlaceholder")} maxLength={240} /></label></div>
            {title && <div className="quiz-title-preview"><span>{language === "zh" ? "标题预览" : "Title preview"}</span><strong><MathText>{title}</MathText></strong></div>}
            <div className="question-editor-list">{questions.map((question, questionIndex) => (
              <article className="question-editor" key={questionIndex}>
                <div className="editor-title"><span>{language === "zh" ? `第 ${questionIndex + 1} 题` : `${t("question")} ${questionIndex + 1}`}</span>{questions.length > 1 && <button type="button" onClick={() => removeQuestion(questionIndex)}>{t("remove")}</button>}</div>
                <input className="prompt-input" value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} placeholder={t("questionPrompt")} />
                <small className="latex-tip">{language === "zh" ? "支持 LaTeX：$...$ 为行内公式，$$...$$ 为独立公式（题目和选项均可使用）" : "LaTeX supported: $...$ for inline math and $$...$$ for display math (questions and options)."}</small>
                <div className="question-image-editor">
                  {question.imagePreview && <div className="question-image-preview"><Image src={question.imagePreview} alt={language === "zh" ? "题目图片预览" : "Question image preview"} width={900} height={520} unoptimized /><button type="button" onClick={() => removeQuestionImage(questionIndex)}>{language === "zh" ? "移除图片" : "Remove image"}</button></div>}
                  <label className="question-image-picker">{question.imagePreview ? (language === "zh" ? "更换题目图片" : "Replace question image") : (language === "zh" ? "＋ 添加题目图片" : "+ Add question image")}<input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={(event) => { selectQuestionImage(questionIndex, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
                  <small>{language === "zh" ? "支持 JPG、JPEG、PNG，单张最大 5 MB。" : "JPG, JPEG, or PNG; maximum 5 MB per image."}</small>
                </div>
                <div className="option-edit-grid">{question.options.map((option, optionIndex) => (
                  <label className={question.correctIndex === optionIndex ? "edit-option answer" : "edit-option"} key={optionIndex}>
                    <input type="radio" name={`correct-${questionIndex}`} checked={question.correctIndex === optionIndex} onChange={() => updateQuestion(questionIndex, { correctIndex: optionIndex })} /><span>{String.fromCharCode(65 + optionIndex)}</span>
                    <input value={option} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`${t("option")} ${String.fromCharCode(65 + optionIndex)}`} />
                  </label>
                ))}</div><small className="answer-tip">{t("correctAnswerTip")}</small>
                <details className="question-live-preview" open>
                  <summary>{language === "zh" ? "实时预览（学生端效果）" : "Live preview (student view)"}</summary>
                  <div className="question-preview-card">
                    {question.prompt ? <h3><MathText>{question.prompt}</MathText></h3> : <h3 className="preview-placeholder">{language === "zh" ? "纯图片题，或在上方输入题目文字" : "Image-only question, or enter question text above"}</h3>}
                    {question.imagePreview && <Image className="preview-question-image" src={question.imagePreview} alt={language === "zh" ? "题目图片" : "Question image"} width={900} height={520} unoptimized />}
                    <div className="question-preview-options">{question.options.map((option, optionIndex) => (
                      <div className={question.correctIndex === optionIndex ? "preview-option correct" : "preview-option"} key={optionIndex}><span>{String.fromCharCode(65 + optionIndex)}</span><div>{option ? <MathText>{option}</MathText> : <em>{language === "zh" ? `选项 ${String.fromCharCode(65 + optionIndex)}` : `Option ${String.fromCharCode(65 + optionIndex)}`}</em>}</div></div>
                    ))}</div>
                  </div>
                </details>
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
