// F-067: Internationalization & Accessibility
// i18n, locale formatting, WCAG accessibility checks.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Locale {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  dateFormat: string;
  numberFormat: {
    decimal: string;
    thousands: string;
    currency: string;
  };
}

export interface TranslationSet {
  locale: string;
  namespace: string;
  translations: Record<string, string>;
}

export interface A11yConfig {
  reducedMotion: boolean;
  highContrast: boolean;
  fontSize: 'normal' | 'large' | 'x-large';
  screenReaderOptimized: boolean;
  keyboardNavigation: boolean;
}

export interface WcagResult {
  rule: string;
  level: 'A' | 'AA' | 'AAA';
  passed: boolean;
  element?: string;
  message: string;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface I18nDbAdapter {
  getTranslations(locale: string, namespace: string): Promise<TranslationSet | null>;
  setTranslations(locale: string, namespace: string, translations: Record<string, string>): Promise<void>;
  getLocales(): Promise<Locale[]>;
  addLocale(locale: Locale): Promise<void>;
  getUserA11yConfig(userId: string): Promise<A11yConfig | null>;
  setUserA11yConfig(userId: string, config: A11yConfig): Promise<void>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const SUPPORTED_LOCALES: Locale[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    dateFormat: 'MM/DD/YYYY',
    numberFormat: { decimal: '.', thousands: ',', currency: 'USD' },
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Espanol',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: ',', thousands: '.', currency: 'EUR' },
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Francais',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: ',', thousands: ' ', currency: 'EUR' },
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    direction: 'ltr',
    dateFormat: 'DD.MM.YYYY',
    numberFormat: { decimal: ',', thousands: '.', currency: 'EUR' },
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Portugues',
    direction: 'ltr',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: ',', thousands: '.', currency: 'BRL' },
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '\u65E5\u672C\u8A9E',
    direction: 'ltr',
    dateFormat: 'YYYY/MM/DD',
    numberFormat: { decimal: '.', thousands: ',', currency: 'JPY' },
  },
  {
    code: 'zh',
    name: 'Chinese',
    nativeName: '\u4E2D\u6587',
    direction: 'ltr',
    dateFormat: 'YYYY/MM/DD',
    numberFormat: { decimal: '.', thousands: ',', currency: 'CNY' },
  },
  {
    code: 'ko',
    name: 'Korean',
    nativeName: '\uD55C\uAD6D\uC5B4',
    direction: 'ltr',
    dateFormat: 'YYYY.MM.DD',
    numberFormat: { decimal: '.', thousands: ',', currency: 'KRW' },
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629',
    direction: 'rtl',
    dateFormat: 'DD/MM/YYYY',
    numberFormat: { decimal: '\u066B', thousands: '\u066C', currency: 'SAR' },
  },
];

export const DEFAULT_A11Y_CONFIG: A11yConfig = {
  reducedMotion: false,
  highContrast: false,
  fontSize: 'normal',
  screenReaderOptimized: false,
  keyboardNavigation: false,
};

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Creates a translator function (t()) that looks up keys with interpolation support.
 * Supports {name} style parameter interpolation.
 */
export function createTranslator(
  translations: TranslationSet[]
): (key: string, params?: Record<string, string | number>) => string {
  // Build a flat lookup map: "namespace.key" -> value
  const lookup = new Map<string, string>();

  for (const set of translations) {
    for (const [k, v] of Object.entries(set.translations)) {
      // Store with namespace prefix and without
      lookup.set(`${set.namespace}.${k}`, v);
      // Also store without namespace for simple lookups
      if (!lookup.has(k)) {
        lookup.set(k, v);
      }
    }
  }

  return (key: string, params?: Record<string, string | number>): string => {
    let value = lookup.get(key) ?? key;

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      }
    }

    return value;
  };
}

/**
 * Formats a date according to the given locale using Intl.DateTimeFormat.
 */
export function formatDate(date: Date, locale: string, format?: string): string {
  const options: Intl.DateTimeFormatOptions = {};

  if (format === 'short') {
    options.dateStyle = 'short';
  } else if (format === 'long') {
    options.dateStyle = 'long';
  } else if (format === 'full') {
    options.dateStyle = 'full';
  } else {
    options.dateStyle = 'medium';
  }

  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Formats a number according to the given locale using Intl.NumberFormat.
 */
export function formatNumber(
  value: number,
  locale: string,
  opts?: { style?: 'decimal' | 'currency' | 'percent'; currency?: string }
): string {
  const options: Intl.NumberFormatOptions = {};

  if (opts?.style) {
    options.style = opts.style;
  }

  if (opts?.style === 'currency' && opts?.currency) {
    options.currency = opts.currency;
  }

  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formats a relative time string like "2 hours ago" or "in 3 days".
 */
export function formatRelativeTime(date: Date, locale: string): string {
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const absDiffMs = Math.abs(diffMs);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  // Determine the best unit
  const seconds = Math.floor(absDiffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  const sign = diffMs < 0 ? -1 : 1;

  if (years > 0) {
    return rtf.format(sign * years, 'year');
  }
  if (months > 0) {
    return rtf.format(sign * months, 'month');
  }
  if (days > 0) {
    return rtf.format(sign * days, 'day');
  }
  if (hours > 0) {
    return rtf.format(sign * hours, 'hour');
  }
  if (minutes > 0) {
    return rtf.format(sign * minutes, 'minute');
  }

  return rtf.format(sign * seconds, 'second');
}

// ─── WCAG Color Contrast ────────────────────────────────────────────────────

/**
 * Parses a hex color string to RGB components.
 */
function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');

  let r: number;
  let g: number;
  let b: number;

  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  }

  return { r, g, b };
}

/**
 * Calculates the relative luminance of a color per WCAG 2.1.
 */
function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const sRGBtoLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const r = sRGBtoLinear(color.r);
  const g = sRGBtoLinear(color.g);
  const b = sRGBtoLinear(color.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Checks the WCAG color contrast ratio between foreground and background colors.
 * Colors should be in hex format (e.g., "#ffffff" or "#fff").
 */
export function checkColorContrast(
  foreground: string,
  background: string
): { ratio: number; passesAA: boolean; passesAAA: boolean } {
  const fgColor = parseHexColor(foreground);
  const bgColor = parseHexColor(background);

  const fgLum = relativeLuminance(fgColor);
  const bgLum = relativeLuminance(bgColor);

  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);

  const ratio = (lighter + 0.05) / (darker + 0.05);

  return {
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
  };
}
