"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Brand from "./Brand";
import BackHomeLink from "./BackHomeLink";
import LanguageToggle from "./LanguageToggle";
import { localizeApiError, useLanguage } from "./LanguageProvider";

type Entry = { nickname: string; score: number; total: number; submittedAt: string };

export default function LeaderboardClient({ code }: { code: string }) {
  const { language, t } = useLanguage();
  const [title, setTitle] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/quizzes/${encodeURIComponent(code)}/leaderboard`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(localizeApiError(data.error, language, "loadLeaderboardFailed"));
      setTitle(data.title); setEntries(data.entries); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("loadLeaderboardFailed")); }
    finally { setRefreshing(false); }
  }, [code, language, t]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(); }, 0);
    const timer = window.setInterval(load, 10000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  return (
    <main className="leaderboard-shell">
      <header className="simple-header inverse"><Brand /><div className="header-actions"><BackHomeLink inverse /><LanguageToggle inverse /><Link href={`/quiz/${code}`}>{t("backToQuiz")}</Link></div></header>
      <section className="leaderboard-head">
        <span className="eyebrow light"><i /> {t("liveUpdates")}</span><h1>{t("classLeaderboard")}</h1><p>{title || `${t("classCode")} ${code}`}</p>
        <button className="refresh-button" onClick={load} disabled={refreshing}>{refreshing ? t("refreshing") : `↻ ${t("refreshRanking")}`}</button>
      </section>
      <section className="ranking-card">
        <div className="ranking-title"><span>{t("rank")}</span><span>{t("student")}</span><span>{t("correctAnswers")}</span></div>
        {error && <div className="error-box">{error}</div>}
        {!error && entries.length === 0 && <div className="empty-state"><b>{t("emptyLeaderboard")}</b><p>{t("emptyLeaderboardDetail")}</p></div>}
        {entries.map((entry, index) => (
          <article className={`rank-row rank-${index + 1}`} key={`${entry.nickname}-${entry.submittedAt}`}>
            <span className="rank-number">{index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}</span>
            <div className="rank-name"><i>{entry.nickname.slice(0, 1).toUpperCase()}</i><strong>{entry.nickname}</strong></div>
            <div className="rank-score"><strong>{entry.score}</strong><span>/ {entry.total}</span></div>
          </article>
        ))}
      </section>
      <p className="privacy-note">{t("leaderboardPrivacy")}</p>
    </main>
  );
}
