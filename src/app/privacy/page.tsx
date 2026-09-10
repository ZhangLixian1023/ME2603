"use client";

import Link from "next/link";
import Brand from "@/components/Brand";
import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/components/LanguageProvider";

export default function PrivacyPage() {
  const { t } = useLanguage();
  return (
    <main className="policy-shell">
      <div className="simple-header"><Brand /><LanguageToggle /></div>
      <article>
        <span className="eyebrow"><i /> PRIVACY</span><h1>{t("privacyTitle")}</h1><p>{t("privacyIntro")}</p>
        <h2>{t("whoSeesWhat")}</h2><p>{t("whoSeesWhatBody")}</p>
        <h2>{t("howUsed")}</h2><p>{t("howUsedBody")}</p>
        <h2>{t("retention")}</h2><p>{t("retentionBody")}</p>
        <h2>{t("nicknameReminder")}</h2><p>{t("nicknameReminderBody")}</p>
        <Link className="secondary-button" href="/">← {t("backHome")}</Link>
      </article>
    </main>
  );
}
