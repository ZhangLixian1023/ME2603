"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Brand from "@/components/Brand";
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/components/LanguageProvider";

export default function Home() {
  const [code, setCode] = useState("");
  const router = useRouter();
  const { language, t } = useLanguage();

  function join(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (normalized) router.push(`/quiz/${encodeURIComponent(normalized)}`);
  }

  return (
    <main className="landing-shell">
      <nav className="topbar">
        <Brand />
        <div className="topbar-actions">
          <LanguageToggle />
          <Link className="nav-link" href="/student">{language === "zh" ? "学生入口" : "Student access"} <span>→</span></Link>
          <Link className="nav-link" href="/teacher">{t("teacherEntry")} <span>→</span></Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><i /> {t("heroEyebrow")}</span>
          <h1>{t("heroTitleStart")}<br /><em>{t("heroTitleEmphasis")}</em></h1>
          <p>{t("heroDescription")}</p>

          <form className="join-box" onSubmit={join}>
            <label htmlFor="quiz-code">{t("classCode")}</label>
            <div className="join-row">
              <input id="quiz-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder={t("codePlaceholder")} maxLength={12} autoComplete="off" />
              <button type="submit">{t("joinQuiz")} <span>↗</span></button>
            </div>
            <span className="join-hint">{t("demoCode")}</span>
          </form>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="score-card">
            <div className="score-top"><span>{t("weeklyQuiz")}</span><b>LIVE</b></div>
            <div className="score-ring"><strong>8</strong><small>/ 10</small></div>
            <div className="score-note">{t("niceWork")}</div>
          </div>
          <div className="float-card float-a"><b>✓</b><span>{t("autoGrading")}<br /><small>{t("instantResults")}</small></span></div>
          <div className="float-card float-b"><b>#1</b><span>{t("classLeaderboard")}<br /><small>{t("nicknameOnly")}</small></span></div>
        </div>
      </section>

      <section className="feature-strip">
        <article><span>01</span><div><h3>{t("noStudentAccount")}</h3><p>{t("idNicknameToJoin")}</p></div></article>
        <article><span>02</span><div><h3>{t("gradedAfterSubmit")}</h3><p>{t("noAnswersRevealed")}</p></div></article>
        <article><span>03</span><div><h3>{t("liveLeaderboard")}</h3><p>{t("rankedByScore")}</p></div></article>
      </section>
      <footer className="site-footer"><span>{t("brand")} · Classroom Quiz</span><Link href="/privacy">{t("privacy")}</Link></footer>
    </main>
  );
}
