"use client";

import Link from "next/link";
import { useLanguage } from "./LanguageProvider";

export default function BackHomeLink({ inverse = false }: { inverse?: boolean }) {
  const { t } = useLanguage();
  return (
    <Link className={`back-home-link${inverse ? " inverse" : ""}`} href="/">
      <b aria-hidden="true">←</b><span>{t("backHome")}</span>
    </Link>
  );
}
