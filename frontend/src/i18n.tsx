/** Simple i18n: Chinese / English auto-detect with toggle. */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

export type Lang = "zh" | "en";

interface I18nContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (zh: string, en: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: "zh",
  setLang: () => {},
  t: (zh) => zh,
});

export function useI18n() {
  return useContext(I18nContext);
}

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("wrag_lang");
    if (saved === "zh" || saved === "en") return saved;
    if (navigator.language.startsWith("zh")) return "zh";
    return "en";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem("wrag_lang", l);
  }, []);

  const t = useCallback(
    (zh: string, en: string) => (lang === "zh" ? zh : en),
    [lang]
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}
