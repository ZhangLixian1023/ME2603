"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Entry = { nickname: string; score: number; total: number; submittedAt: string };

export default function LeaderboardClient({ code }: { code: string }) {
  const [title, setTitle] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/quizzes/${encodeURIComponent(code)}/leaderboard`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法载入排行榜");
      setTitle(data.title);
      setEntries(data.entries);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法载入排行榜");
    } finally {
      setRefreshing(false);
    }
  }, [code]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(load, 10000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  return (
    <main className="leaderboard-shell">
      <header className="simple-header inverse"><Link className="brand" href="/"><span className="brand-mark">答</span><span>答答看</span></Link><Link href={`/quiz/${code}`}>返回测验</Link></header>
      <section className="leaderboard-head">
        <span className="eyebrow light"><i /> 实时更新</span>
        <h1>班级排行榜</h1>
        <p>{title || `课堂代码 ${code}`}</p>
        <button className="refresh-button" onClick={load} disabled={refreshing}>{refreshing ? "刷新中…" : "↻ 刷新排名"}</button>
      </section>
      <section className="ranking-card">
        <div className="ranking-title"><span>排名</span><span>同学</span><span>正确题数</span></div>
        {error && <div className="error-box">{error}</div>}
        {!error && entries.length === 0 && <div className="empty-state"><b>榜单还是空的</b><p>第一份答卷提交后，排名会出现在这里。</p></div>}
        {entries.map((entry, index) => (
          <article className={`rank-row rank-${index + 1}`} key={`${entry.nickname}-${entry.submittedAt}`}>
            <span className="rank-number">{index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}</span>
            <div className="rank-name"><i>{entry.nickname.slice(0, 1).toUpperCase()}</i><strong>{entry.nickname}</strong></div>
            <div className="rank-score"><strong>{entry.score}</strong><span>/ {entry.total}</span></div>
          </article>
        ))}
      </section>
      <p className="privacy-note">排行榜仅显示昵称，学号不会公开 · 每 10 秒自动更新</p>
    </main>
  );
}
