"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";

export default function Brand({ inverse = false }: { inverse?: boolean }) {
  const { language, t } = useLanguage();
  return (
    <Link className={`brand${inverse ? " inverse-brand" : ""}`} href="/">
      <span className="brand-mark">{language === "zh" ? "答" : "Q"}</span>
      <span>{t("brand")}</span>
    </Link>
  );
}
