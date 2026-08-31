import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="policy-shell">
      <Link className="brand" href="/"><span className="brand-mark">答</span><span>答答看</span></Link>
      <article>
        <span className="eyebrow"><i /> PRIVACY</span>
        <h1>隐私说明</h1>
        <p>答答看只收集完成课堂测验所需的信息：学号、学生自选昵称、作答内容、得分与提交时间。</p>
        <h2>谁能看到什么？</h2>
        <p>公开排行榜只显示昵称与正确题数。学号、具体作答和提交记录仅教师端可见，标准答案不会通过学生接口公开。</p>
        <h2>信息如何使用？</h2>
        <p>数据仅用于限制重复提交、自动评分、生成班级统计，以及由教师处理重答申请。本站不包含广告，也不出售学生数据。</p>
        <h2>保存多久？</h2>
        <p>答卷默认保存 365 天，管理员可通过环境变量调整期限。教师也可在后台删除测验或单条答卷。</p>
        <h2>昵称提醒</h2>
        <p>昵称会公开显示，请不要在昵称中填写真实姓名、学号、电话或其他敏感信息。</p>
        <Link className="secondary-button" href="/">← 返回首页</Link>
      </article>
    </main>
  );
}
