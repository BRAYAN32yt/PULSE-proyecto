/**
 * Internationalization.
 *
 * Spanish and English are the primary languages; French and Portuguese ship
 * complete too. Adding another language is just dropping a dictionary in
 * `locales/` and registering it in AVAILABLE_LOCALES and the constructor below.
 * Any missing key falls back to English at runtime.
 */

export type LocaleCode = 'es' | 'en' | 'fr' | 'pt';

export interface Dictionary {
  [key: string]: string;
}

export const AVAILABLE_LOCALES: Array<{ code: LocaleCode; label: string; flag: string }> = [
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
];

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

class I18n {
  private locale: LocaleCode;
  private dict: Dictionary;
  private readonly listeners = new Set<(locale: LocaleCode) => void>();

  constructor(private readonly dictionaries: Record<LocaleCode, Dictionary>) {
    this.locale = this.detect();
    this.dict = dictionaries[this.locale] ?? dictionaries.en;
  }

  private detect(): LocaleCode {
    const stored = localStorage.getItem('worldpulse.locale') as LocaleCode | null;
    if (stored && this.dictionaries[stored]) return stored;
    const nav = (navigator.language || 'es').slice(0, 2).toLowerCase() as LocaleCode;
    return this.dictionaries[nav] ? nav : 'es';
  }

  get current(): LocaleCode { return this.locale; }

  setLocale(code: LocaleCode): void {
    if (!this.dictionaries[code]) return;
    this.locale = code;
    this.dict = this.dictionaries[code];
    localStorage.setItem('worldpulse.locale', code);
    document.documentElement.lang = code;
    for (const listener of this.listeners) listener(code);
  }

  onChange(listener: (locale: LocaleCode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  t(key: string, vars?: Record<string, string | number>): string {
    const template = this.dict[key] ?? this.dictionaries.en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
  }
}

import es from './locales/es';
import en from './locales/en';
import fr from './locales/fr';
import pt from './locales/pt';

export const i18n = new I18n({ es, en, fr, pt });
export const t: TranslateFn = (key, vars) => i18n.t(key, vars);
