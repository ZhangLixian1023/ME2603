"use client";

import { useLanguage } from "./LanguageProvider";

export default function LanguageToggle({ inverse = false }: { inverse?: boolean }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={`language-toggle${inverse ? " inverse" : ""}`} aria-label="Language selector">
      <button className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} type="button">EN</button>
      <span>/</span>
      <button className={language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")} type="button">中文</button>
    </div>
  );
}
