"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [code, setCode] = useState("");
  const router = useRouter();

  function join(event: FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (normalized) router.push(`/quiz/${encodeURIComponent(normalized)}`);
  }

  return (
    <main className="landing-shell">
      <nav className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">答</span>
          <span>答答看</span>
        </Link>
        <Link className="nav-link" href="/teacher">教师入口 <span>→</span></Link>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><i /> 为课堂而生的轻量 Quiz</span>
          <h1>每一次回答，<br /><em>都值得被看见。</em></h1>
          <p>输入课堂代码，即刻开始答题。无需注册，提交后马上知道自己的掌握情况。</p>

          <form className="join-box" onSubmit={join}>
            <label htmlFor="quiz-code">课堂代码</label>
            <div className="join-row">
              <input
                id="quiz-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="例如 DEMO26"
                maxLength={12}
                autoComplete="off"
              />
              <button type="submit">进入测验 <span>↗</span></button>
            </div>
            <span className="join-hint">试用代码：DEMO26</span>
          </form>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="score-card">
            <div className="score-top"><span>本周小测</span><b>LIVE</b></div>
            <div className="score-ring"><strong>8</strong><small>/ 10</small></div>
            <div className="score-note">做得不错，再接再厉！</div>
          </div>
          <div className="float-card float-a"><b>✓</b><span>自动批改<br /><small>提交即出结果</small></span></div>
          <div className="float-card float-b"><b>#1</b><span>班级榜单<br /><small>只展示昵称</small></span></div>
        </div>
      </section>

      <section className="feature-strip">
        <article><span>01</span><div><h3>无需学生账号</h3><p>输入学号与昵称即可参与</p></div></article>
        <article><span>02</span><div><h3>提交后自动判分</h3><p>只提示对错，不泄露答案</p></div></article>
        <article><span>03</span><div><h3>实时班级榜单</h3><p>按正确题数轻松排名</p></div></article>
      </section>
      <footer className="site-footer"><span>答答看 · Classroom Quiz</span><Link href="/privacy">隐私说明</Link></footer>
    </main>
  );
}
