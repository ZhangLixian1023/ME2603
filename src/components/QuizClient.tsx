"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import Brand from "./Brand";
import BackHomeLink from "./BackHomeLink";
import LanguageToggle from "./LanguageToggle";
import { localizeApiError, useLanguage } from "./LanguageProvider";

type Quiz = { code: string; title: string; description: string; questions: Array<{ id: number; prompt: string; options: string[] }> };
type Result = { score: number; total: number; correctness: boolean[] };

export default function QuizClient({ code }: { code: string }) {
  const { language, t } = useLanguage();
  const languageRef = useRef(language);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [identityReady, setIdentityReady] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [nickname, setNickname] = useState("");
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    fetch(`/api/quizzes/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(localizeApiError(data.error, languageRef.current, "loadQuizFailed"));
        setQuiz(data.quiz);
        setAnswers(new Array(data.quiz.questions.length).fill(-1));
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [code]);

  function begin(event: FormEvent) {
    event.preventDefault();
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(studentId.trim())) { setError(t("invalidStudentId")); return; }
    if (!nickname.trim() || nickname.trim().length > 20) { setError(t("invalidNickname")); return; }
    setError(""); setIdentityReady(true);
  }

  async function submit() {
    if (!quiz || answers.some((answer) => answer < 0)) { setError(t("unanswered")); return; }
    if (!window.confirm(t("confirmSubmit"))) return;
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/quizzes/${encodeURIComponent(code)}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: studentId.trim(), nickname: nickname.trim(), answers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(localizeApiError(data.error, language, "submitFailed"));
      setResult(data); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("submitFailed")); }
    finally { setSubmitting(false); }
  }

  if (loading) return <CenteredMessage title={t("loadingQuiz")} detail={t("justAMoment")} />;
  if (!quiz) return <CenteredMessage title={t("unavailable")} detail={error || t("quizNotFound")} action />;

  if (result) return (
    <main className="quiz-shell result-shell">
      <header className="simple-header"><Brand /><div className="header-actions"><BackHomeLink /><LanguageToggle /></div></header>
      <section className="result-hero">
        <span className="tiny-label">{t("submitted")}</span>
        <div className="result-score"><strong>{result.score}</strong><span>/ {result.total}</span></div>
        <h1>{result.score === result.total ? t("perfect") : result.score >= result.total * 0.6 ? t("goodJob") : t("keepTrying")}</h1>
        <p>{t("resultPrivacy")}</p>
      </section>
      <section className="result-list">{quiz.questions.map((question, index) => (
        <article className={result.correctness[index] ? "result-item correct" : "result-item wrong"} key={question.id}>
          <span>{result.correctness[index] ? "✓" : "×"}</span>
          <div><small>{language === "zh" ? `${t("question")} ${index + 1} 题` : `${t("question")} ${index + 1}`}</small><p>{question.prompt}</p></div>
          <b>{result.correctness[index] ? t("correct") : t("incorrect")}</b>
        </article>
      ))}</section>
      <div className="result-actions"><Link className="primary-button" href={`/quiz/${code}/leaderboard`}>{t("viewLeaderboard")}</Link><Link className="secondary-button" href="/">{t("backHome")}</Link></div>
    </main>
  );

  if (!identityReady) return (
    <main className="quiz-shell identity-shell">
      <header className="simple-header"><Brand /><div className="header-actions"><BackHomeLink /><LanguageToggle /><span className="code-pill">{t("code")} {quiz.code}</span></div></header>
      <section className="identity-card">
        <span className="eyebrow"><i /> {t("readyToStart")}</span><h1>{quiz.title}</h1><p>{quiz.description}</p>
        <div className="quiz-meta"><span>{quiz.questions.length} {t("multipleChoiceQuestions")}</span><span>{t("oneSubmission")}</span></div>
        <form onSubmit={begin}>
          <label>{t("studentId")} <small>{t("teacherOnly")}</small><input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder={t("studentIdPlaceholder")} autoFocus /></label>
          <label>{t("leaderboardNickname")} <small>{t("publicDisplay")}</small><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder={t("nicknamePlaceholder")} maxLength={20} /></label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-button wide" type="submit">{t("startQuiz")} <span>→</span></button>
        </form>
      </section>
    </main>
  );

  const answered = answers.filter((answer) => answer >= 0).length;
  return (
    <main className="quiz-shell answering-shell">
      <header className="quiz-header"><div><span className="tiny-label">{t("answering")}</span><h1>{quiz.title}</h1></div><div className="header-actions"><BackHomeLink /><LanguageToggle /><div className="progress-copy"><strong>{answered}</strong> / {quiz.questions.length} {t("completed")}</div></div></header>
      <div className="progress-track"><i style={{ width: `${(answered / quiz.questions.length) * 100}%` }} /></div>
      <section className="questions-list">{quiz.questions.map((question, questionIndex) => (
        <article className="question-card" key={question.id}><div className="question-number">{String(questionIndex + 1).padStart(2, "0")}</div><h2>{question.prompt}</h2>
          <div className="options-grid">{question.options.map((option, optionIndex) => (
            <label className={answers[questionIndex] === optionIndex ? "option selected" : "option"} key={optionIndex}>
              <input type="radio" name={`question-${question.id}`} checked={answers[questionIndex] === optionIndex} onChange={() => setAnswers((current) => current.map((value, index) => index === questionIndex ? optionIndex : value))} />
              <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
            </label>
          ))}</div>
        </article>
      ))}</section>
      {error && <div className="error-box sticky-error">{error}</div>}
      <div className="submit-bar"><div><strong>{nickname}</strong><span>{t("answerEveryQuestion")}</span></div><button className="primary-button" onClick={submit} disabled={submitting}>{submitting ? t("submitting") : t("submitAll")}</button></div>
    </main>
  );
}

function CenteredMessage({ title, detail, action = false }: { title: string; detail: string; action?: boolean }) {
  const { language, t } = useLanguage();
  return <main className="center-message"><LanguageToggle /><div className="brand-mark">{language === "zh" ? "答" : "Q"}</div><h1>{title}</h1><p>{detail}</p>{action && <Link className="primary-button" href="/">{t("backHome")}</Link>}</main>;
}
