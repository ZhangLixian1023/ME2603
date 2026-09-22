"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import Brand from "./Brand";
import BackHomeLink from "./BackHomeLink";
import LanguageToggle from "./LanguageToggle";
import MathText from "./MathText";
import { localizeApiError, useLanguage } from "./LanguageProvider";

type Quiz = { code: string; title: string; description: string; questions: Array<{ id: number; prompt: string; options: string[]; imageUrl: string | null }> };
type Result = { score: number; total: number; correctness: boolean[]; timedOut?: boolean };
type Attempt = { status: "active" | "submitted"; startedAt: string; expiresAt: string; answers: number[]; extensionCount: number; result: Result | null };
type Progress = { startedCount: number; unsubmittedCount: number; submittedCount: number; timedOutCount: number; enabled: boolean; refreshedAt: string };
type Rules = { durationSeconds: number; extensionSeconds: number; extensionCheckSeconds: number; extensionThreshold: number; minimumParticipants: number; progressRefreshSeconds: number };
type AttemptPayload = { attempt: Attempt; progress?: Progress; rules?: Rules; serverNow?: string };

function formatTime(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export default function QuizClient({ code }: { code: string }) {
  const { language, t } = useLanguage();
  const languageRef = useRef(language);
  const serverOffsetRef = useRef(0);
  const statusBusyRef = useRef(false);
  const zeroRefreshAtRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [student, setStudent] = useState<{ studentId: string; name: string } | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [extensionNotice, setExtensionNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const applyAttemptPayload = useCallback((payload: AttemptPayload, preserveLocalAnswers = false) => {
    if (payload.serverNow) serverOffsetRef.current = Date.parse(payload.serverNow) - Date.now();
    setAttempt((previous) => {
      if (previous && payload.attempt.extensionCount > previous.extensionCount) {
        setExtensionNotice(languageRef.current === "zh" ? "未提交人数超过 40%，已自动增加 2 分钟。" : "More than 40% have not submitted. 2 minutes were added automatically.");
      }
      return payload.attempt;
    });
    if (!preserveLocalAnswers || payload.attempt.status === "submitted") setAnswers(payload.attempt.answers);
    if (payload.progress) setProgress(payload.progress);
    if (payload.rules) setRules(payload.rules);
    if (payload.attempt.result) setResult(payload.attempt.result);
    const serverNow = payload.serverNow ? Date.parse(payload.serverNow) : Date.now() + serverOffsetRef.current;
    setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(payload.attempt.expiresAt) - serverNow) / 1000)));
  }, []);

  const refreshAttempt = useCallback(async () => {
    if (statusBusyRef.current) return;
    statusBusyRef.current = true;
    try {
      const response = await fetch(`/api/quizzes/${encodeURIComponent(code)}/attempt`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(localizeApiError(data.error, languageRef.current, "loadQuizFailed"));
      applyAttemptPayload(data, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : languageRef.current === "zh" ? "无法刷新答题状态" : "Unable to refresh quiz status");
    } finally {
      statusBusyRef.current = false;
    }
  }, [applyAttemptPayload, code]);

  useEffect(() => {
    Promise.all([
      fetch("/api/student/session", { cache: "no-store" }).then((response) => response.json()),
      fetch(`/api/quizzes/${encodeURIComponent(code)}`, { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(localizeApiError(data.error, languageRef.current, "loadQuizFailed"));
        return data;
      }),
    ])
      .then(([sessionData, quizData]) => {
        setStudent(sessionData.student || null);
        setQuiz(quizData.quiz);
        applyAttemptPayload(quizData);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [applyAttemptPayload, code]);

  useEffect(() => {
    if (!attempt || attempt.status !== "active") return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(attempt.expiresAt) - (Date.now() + serverOffsetRef.current)) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0 && Date.now() - zeroRefreshAtRef.current >= 5000) {
        zeroRefreshAtRef.current = Date.now();
        void refreshAttempt();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [attempt, refreshAttempt]);

  useEffect(() => {
    if (!attempt || attempt.status !== "active") return;
    const interval = window.setInterval(() => void refreshAttempt(), (rules?.progressRefreshSeconds || 30) * 1000);
    return () => window.clearInterval(interval);
  }, [attempt, refreshAttempt, rules?.progressRefreshSeconds]);

  useEffect(() => {
    if (!extensionNotice) return;
    const timeout = window.setTimeout(() => setExtensionNotice(""), 7000);
    return () => window.clearTimeout(timeout);
  }, [extensionNotice]);

  function selectAnswer(questionIndex: number, answer: number) {
    if (!attempt || attempt.status !== "active" || remainingSeconds <= 0) return;
    setAnswers((current) => current.map((value, index) => index === questionIndex ? answer : value));
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      const response = await fetch(`/api/quizzes/${encodeURIComponent(code)}/attempt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIndex, answer }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(localizeApiError(data.error, languageRef.current, "submitFailed"));
      applyAttemptPayload({ attempt: data.attempt }, true);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : t("submitFailed")));
  }

  async function submit() {
    if (!quiz || answers.some((answer) => answer < 0)) { setError(t("unanswered")); return; }
    if (!window.confirm(t("confirmSubmit"))) return;
    setSubmitting(true); setError("");
    try {
      await saveQueueRef.current;
      const response = await fetch(`/api/quizzes/${encodeURIComponent(code)}/submit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(localizeApiError(data.error, language, "submitFailed"));
      setResult(data); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("submitFailed")); }
    finally { setSubmitting(false); }
  }

  if (loading) return <CenteredMessage title={t("loadingQuiz")} detail={t("justAMoment")} />;
  if (!quiz || !attempt) return <CenteredMessage title={t("unavailable")} detail={error || t("quizNotFound")} action />;

  if (result) {
    const wrongQuestionNumbers = result.correctness.flatMap((correct, index) => correct ? [] : [index + 1]);
    return (
    <main className="quiz-shell result-shell">
      <header className="simple-header"><Brand /><div className="header-actions"><BackHomeLink /><LanguageToggle /></div></header>
      <section className="result-hero">
        <span className="tiny-label">{result.timedOut ? (language === "zh" ? "时间到，已自动提交" : "Time expired · submitted automatically") : t("submitted")}</span>
        <div className="result-score"><strong>{result.score}</strong><span>/ {result.total}</span></div>
        <h1>{result.score === result.total ? t("perfect") : result.score >= result.total * 0.6 ? t("goodJob") : t("keepTrying")}</h1>
        <p>{language === "zh" ? "答错题号会标红，标准答案仍然保密。" : t("resultPrivacy")}</p>
        <div className="result-question-map" aria-label={language === "zh" ? "每题答题结果" : "Result by question"}>{result.correctness.map((correct, index) => <span className={correct ? "correct" : "wrong"} title={correct ? t("correct") : t("incorrect")} aria-label={`${language === "zh" ? `第 ${index + 1} 题` : `Question ${index + 1}`}: ${correct ? t("correct") : t("incorrect")}`} key={index}>{index + 1}</span>)}</div>
        {wrongQuestionNumbers.length > 0 && <div className="wrong-question-summary"><strong>{language === "zh" ? "答错题目：" : "Incorrect questions:"}</strong>{wrongQuestionNumbers.map((number) => <b key={number}>{language === "zh" ? `第 ${number} 题` : `Q${number}`}</b>)}</div>}
      </section>
      <div className="result-actions"><Link className="primary-button" href={`/quiz/${code}/leaderboard`}>{t("viewLeaderboard")}</Link><Link className="secondary-button" href="/">{t("backHome")}</Link></div>
    </main>
    );
  }

  const answered = answers.filter((answer) => answer >= 0).length;
  const timeExpired = remainingSeconds <= 0;
  return (
    <main className="quiz-shell answering-shell">
      <header className="quiz-header">
        <div><span className="tiny-label">{t("answering")}</span><h1><MathText>{quiz.title}</MathText></h1></div>
        <div className="header-actions"><BackHomeLink /><LanguageToggle /></div>
      </header>
      <section className="quiz-live-bar">
        <div className={remainingSeconds <= 60 ? "countdown-card urgent" : "countdown-card"}><span>{language === "zh" ? "剩余时间" : "Time remaining"}</span><strong>{formatTime(remainingSeconds)}</strong></div>
        <div className="participation-card"><span>{language === "zh" ? "未提交 / 已开始" : "Not submitted / Started"}</span><strong>{progress?.unsubmittedCount ?? 0} / {progress?.startedCount ?? 0}</strong><small>{language === "zh" ? "每 30 秒刷新一次" : "Updated every 30 seconds"}</small></div>
        <div className="progress-copy"><strong>{answered}</strong> / {quiz.questions.length} {t("completed")}</div>
      </section>
      <div className="timing-rule">{language === "zh" ? "规则：每位同学进入后自动开始 10 分钟倒计时。至少 5 人开始后，如果进入最后 1 分钟时未提交人数超过已开始人数的 40%，系统自动增加 2 分钟。" : "Rule: Your 10-minute timer starts when you enter. Once at least 5 students have started, 2 minutes are added automatically if more than 40% have not submitted when the final minute begins."}</div>
      {extensionNotice && <div className="notice-box timing-notice">{extensionNotice}</div>}
      <div className="progress-track"><i style={{ width: `${(answered / quiz.questions.length) * 100}%` }} /></div>
      <section className="questions-list">{quiz.questions.map((question, questionIndex) => (
        <article className="question-card" key={question.id}><div className="question-number">{String(questionIndex + 1).padStart(2, "0")}</div>{question.prompt && <h2><MathText>{question.prompt}</MathText></h2>}
          {question.imageUrl && <Image className="question-image" src={question.imageUrl} alt={`${t("question")} ${questionIndex + 1}`} width={900} height={520} unoptimized />}
          <div className="options-grid">{question.options.map((option, optionIndex) => (
            <label className={answers[questionIndex] === optionIndex ? "option selected" : "option"} key={optionIndex} aria-disabled={timeExpired}>
              <input type="radio" name={`question-${question.id}`} checked={answers[questionIndex] === optionIndex} disabled={timeExpired || submitting} onChange={() => selectAnswer(questionIndex, optionIndex)} />
              <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><MathText>{option}</MathText>
            </label>
          ))}</div>
        </article>
      ))}</section>
      {error && <div className="error-box sticky-error">{error}</div>}
      <div className="submit-bar"><div><strong>{student?.name}</strong><span>{timeExpired ? (language === "zh" ? "时间到，正在自动提交…" : "Time is up. Submitting automatically…") : t("answerEveryQuestion")}</span></div><button className="primary-button" onClick={submit} disabled={submitting || timeExpired}>{submitting ? t("submitting") : t("submitAll")}</button></div>
    </main>
  );
}

function CenteredMessage({ title, detail, action = false }: { title: string; detail: string; action?: boolean }) {
  const { language, t } = useLanguage();
  return <main className="center-message"><LanguageToggle /><div className="brand-mark">{language === "zh" ? "答" : "Q"}</div><h1>{title}</h1><p>{detail}</p>{action && <Link className="primary-button" href="/">{t("backHome")}</Link>}</main>;
}
