/** i18n: Chinese / English with auto-detect mode.
 *
 *  Language preference is persisted in localStorage as "wrag_lang".
 *  Supports "auto", "zh", "en" — matches SAG's three-way toggle.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";

export type Lang = "zh" | "en";
export type LangPreference = "auto" | Lang;

const STORAGE_KEY = "wrag_lang";

interface I18nContextType {
  lang: Lang;
  preference: LangPreference;
  setPreference: (p: LangPreference) => void;
  t: (zh: string, en: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: "zh",
  preference: "auto",
  setPreference: () => {},
  t: (zh) => zh,
});

export function useI18n() {
  return useContext(I18nContext);
}

function detectBrowserLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  return langs.some((l) => l.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

function loadPreference(): LangPreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "zh" || v === "en" || v === "auto") return v;
  } catch { /* ignore */ }
  return "auto";
}

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<LangPreference>(loadPreference);
  const [browserLang, setBrowserLang] = useState<Lang>(detectBrowserLang);

  const lang: Lang = preference === "auto" ? browserLang : preference;

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  // Listen for browser language changes
  useEffect(() => {
    const cb = () => setBrowserLang(detectBrowserLang());
    window.addEventListener("languagechange", cb);
    return () => window.removeEventListener("languagechange", cb);
  }, []);

  const setPreference = useCallback((p: LangPreference) => {
    setPreferenceState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (zh: string, en: string) => (lang === "zh" ? zh : en),
    [lang],
  );

  const value = useMemo(
    () => ({ lang, preference, setPreference, t }),
    [lang, preference, setPreference, t],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}
