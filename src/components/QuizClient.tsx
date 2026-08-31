"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Quiz = {
  code: string;
  title: string;
  description: string;
  questions: Array<{ id: number; prompt: string; options: string[] }>;
};

type Result = { score: number; total: number; correctness: boolean[] };

export default function QuizClient({ code }: { code: string }) {
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
    fetch(`/api/quizzes/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "无法载入测验");
        setQuiz(data.quiz);
        setAnswers(new Array(data.quiz.questions.length).fill(-1));
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [code]);

  function begin(event: FormEvent) {
    event.preventDefault();
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(studentId.trim())) {
      setError("请输入有效学号（2–30 位字母、数字、- 或 _）");
      return;
    }
    if (!nickname.trim() || nickname.trim().length > 20) {
      setError("请输入 1–20 个字符的昵称");
      return;
    }
    setError("");
    setIdentityReady(true);
  }

  async function submit() {
    if (!quiz || answers.some((answer) => answer < 0)) {
      setError("还有题目没有回答，请检查后再提交。");
      return;
    }
    if (!window.confirm("提交后不能修改答案，确定提交吗？")) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/quizzes/${encodeURIComponent(code)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: studentId.trim(), nickname: nickname.trim(), answers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "提交失败");
      setResult(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <CenteredMessage title="正在打开测验…" detail="马上就好" />;
  if (!quiz) return <CenteredMessage title="暂时无法进入" detail={error || "测验不存在"} action />;

  if (result) {
    return (
      <main className="quiz-shell result-shell">
        <header className="simple-header"><Link className="brand" href="/"><span className="brand-mark">答</span><span>答答看</span></Link></header>
        <section className="result-hero">
          <span className="tiny-label">提交成功</span>
          <div className="result-score"><strong>{result.score}</strong><span>/ {result.total}</span></div>
          <h1>{result.score === result.total ? "全部答对，太棒了！" : result.score >= result.total * 0.6 ? "做得不错！" : "继续加油！"}</h1>
          <p>以下仅显示每题对错，正确答案不会公开。</p>
        </section>
        <section className="result-list">
          {quiz.questions.map((question, index) => (
            <article className={result.correctness[index] ? "result-item correct" : "result-item wrong"} key={question.id}>
              <span>{result.correctness[index] ? "✓" : "×"}</span>
              <div><small>第 {index + 1} 题</small><p>{question.prompt}</p></div>
              <b>{result.correctness[index] ? "回答正确" : "回答错误"}</b>
            </article>
          ))}
        </section>
        <div className="result-actions">
          <Link className="primary-button" href={`/quiz/${code}/leaderboard`}>查看排行榜</Link>
          <Link className="secondary-button" href="/">返回首页</Link>
        </div>
      </main>
    );
  }

  if (!identityReady) {
    return (
      <main className="quiz-shell identity-shell">
        <header className="simple-header"><Link className="brand" href="/"><span className="brand-mark">答</span><span>答答看</span></Link><span className="code-pill">代码 {quiz.code}</span></header>
        <section className="identity-card">
          <span className="eyebrow"><i /> 准备开始</span>
          <h1>{quiz.title}</h1>
          <p>{quiz.description}</p>
          <div className="quiz-meta"><span>{quiz.questions.length} 道选择题</span><span>仅可提交 1 次</span></div>
          <form onSubmit={begin}>
            <label>学号 <small>仅老师可见</small><input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="请输入你的学号" autoFocus /></label>
            <label>排行榜昵称 <small>公开显示</small><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="例如：快乐小熊" maxLength={20} /></label>
            {error && <div className="error-box">{error}</div>}
            <button className="primary-button wide" type="submit">开始答题 <span>→</span></button>
          </form>
        </section>
      </main>
    );
  }

  const answered = answers.filter((answer) => answer >= 0).length;
  return (
    <main className="quiz-shell answering-shell">
      <header className="quiz-header">
        <div><span className="tiny-label">正在答题</span><h1>{quiz.title}</h1></div>
        <div className="progress-copy"><strong>{answered}</strong> / {quiz.questions.length} 已完成</div>
      </header>
      <div className="progress-track"><i style={{ width: `${(answered / quiz.questions.length) * 100}%` }} /></div>
      <section className="questions-list">
        {quiz.questions.map((question, questionIndex) => (
          <article className="question-card" key={question.id}>
            <div className="question-number">{String(questionIndex + 1).padStart(2, "0")}</div>
            <h2>{question.prompt}</h2>
            <div className="options-grid">
              {question.options.map((option, optionIndex) => (
                <label className={answers[questionIndex] === optionIndex ? "option selected" : "option"} key={optionIndex}>
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    checked={answers[questionIndex] === optionIndex}
                    onChange={() => setAnswers((current) => current.map((value, index) => index === questionIndex ? optionIndex : value))}
                  />
                  <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
                </label>
              ))}
            </div>
          </article>
        ))}
      </section>
      {error && <div className="error-box sticky-error">{error}</div>}
      <div className="submit-bar"><div><strong>{nickname}</strong><span>请确认每道题都已作答</span></div><button className="primary-button" onClick={submit} disabled={submitting}>{submitting ? "提交中…" : "提交全部答案"}</button></div>
    </main>
  );
}

function CenteredMessage({ title, detail, action = false }: { title: string; detail: string; action?: boolean }) {
  return <main className="center-message"><div className="brand-mark">答</div><h1>{title}</h1><p>{detail}</p>{action && <Link className="primary-button" href="/">返回首页</Link>}</main>;
}
