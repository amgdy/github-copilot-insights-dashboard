"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { en } from "./translations/en";
import { ar } from "./translations/ar";
import { es } from "./translations/es";
import { fr } from "./translations/fr";
import type { TranslationKeys } from "./translations/en";

export type Locale = "en" | "ar" | "es" | "fr";

const LOCALES: Record<Locale, { label: string; dir: "ltr" | "rtl"; translations: TranslationKeys }> = {
  en: { label: "English", dir: "ltr", translations: en },
  ar: { label: "العربية", dir: "rtl", translations: ar },
  es: { label: "Español", dir: "ltr", translations: es },
  fr: { label: "Français", dir: "ltr", translations: fr },
};

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, ...args: (string | number)[]) => string;
  dir: "ltr" | "rtl";
  locales: Array<{ code: Locale; label: string }>;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key: string) => key,
  dir: "ltr",
  locales: [],
});

export const useTranslation = () => useContext(LocaleContext);

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = localStorage.getItem("locale") as Locale | null;
    if (stored && stored in LOCALES) {
      setLocaleState(stored);
      document.documentElement.lang = stored;
      document.documentElement.dir = LOCALES[stored].dir;
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
    document.documentElement.lang = l;
    document.documentElement.dir = LOCALES[l].dir;
  }, []);

  const t = useCallback((key: string, ...args: (string | number)[]): string => {
    const localeData = LOCALES[locale];
    let value = getNestedValue(localeData.translations as unknown as Record<string, unknown>, key);
    // Fallback to English
    if (!value && locale !== "en") {
      value = getNestedValue(en as unknown as Record<string, unknown>, key);
    }
    if (!value) return key;
    // Replace {0}, {1}, etc. placeholders
    if (args.length > 0) {
      return args.reduce<string>((str, arg, i) => str.replace(`{${i}}`, String(arg)), value);
    }
    return value;
  }, [locale]);

  const locales = Object.entries(LOCALES).map(([code, { label }]) => ({
    code: code as Locale,
    label,
  }));

  return (
    <LocaleContext value={{ locale, setLocale, t, dir: LOCALES[locale].dir, locales }}>
      {children}
    </LocaleContext>
  );
}
