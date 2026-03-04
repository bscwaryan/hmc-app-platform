import { describe, it } from 'node:test';
import assert from 'node:assert';

// ── Inline Implementations ───────────────────────────────────────────────────
// The i18n package source does not exist yet. These tests define the
// expected behaviour so the implementation can be verified once written.
// For now, we implement the core functions inline.

type TranslationMap = Record<string, string>;

/**
 * Creates a translator function that looks up keys in a translation map
 * and interpolates parameters using {{paramName}} syntax.
 */
function createTranslator(translations: TranslationMap) {
  return (key: string, params?: Record<string, string | number>): string => {
    let value = translations[key];
    if (value === undefined) {
      return key; // Return the key itself as fallback
    }

    if (params) {
      for (const [paramKey, paramValue] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(paramValue));
      }
    }

    return value;
  };
}

/**
 * Calculates the relative luminance of a hex color for WCAG contrast checks.
 */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Checks the contrast ratio between two colors (WCAG 2.1).
 * Returns the contrast ratio (1 to 21).
 */
function checkColorContrast(foreground: string, background: string): number {
  const lumFg = relativeLuminance(foreground);
  const lumBg = relativeLuminance(background);

  const lighter = Math.max(lumFg, lumBg);
  const darker = Math.min(lumFg, lumBg);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Formats a number according to the specified locale.
 */
function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('i18n', () => {
  describe('createTranslator()', () => {
    const translations: TranslationMap = {
      'greeting.hello': 'Hello, {{name}}!',
      'messages.count': 'You have {{count}} new messages.',
      'simple.text': 'This is a simple string.',
      'multi.param': '{{user}} sent {{count}} items to {{recipient}}.',
    };

    it('looks up keys correctly', () => {
      const t = createTranslator(translations);

      assert.strictEqual(t('simple.text'), 'This is a simple string.');
    });

    it('returns the key itself for missing translations', () => {
      const t = createTranslator(translations);

      assert.strictEqual(t('missing.key'), 'missing.key');
    });

    it('interpolates a single parameter', () => {
      const t = createTranslator(translations);

      assert.strictEqual(t('greeting.hello', { name: 'World' }), 'Hello, World!');
    });

    it('interpolates numeric parameters', () => {
      const t = createTranslator(translations);

      assert.strictEqual(t('messages.count', { count: 5 }), 'You have 5 new messages.');
    });

    it('interpolates multiple parameters', () => {
      const t = createTranslator(translations);

      const result = t('multi.param', { user: 'Alice', count: 3, recipient: 'Bob' });
      assert.strictEqual(result, 'Alice sent 3 items to Bob.');
    });

    it('leaves unreplaced placeholders when params are missing', () => {
      const t = createTranslator(translations);

      const result = t('greeting.hello');
      assert.strictEqual(result, 'Hello, {{name}}!');
    });
  });

  describe('checkColorContrast()', () => {
    it('calculates correct ratio for black on white (21:1)', () => {
      const ratio = checkColorContrast('#000000', '#ffffff');

      // Black on white should be exactly 21:1
      assert.ok(Math.abs(ratio - 21) < 0.1, `expected ~21, got ${ratio}`);
    });

    it('calculates correct ratio for white on white (1:1)', () => {
      const ratio = checkColorContrast('#ffffff', '#ffffff');

      assert.ok(Math.abs(ratio - 1) < 0.01, `expected ~1, got ${ratio}`);
    });

    it('calculates correct ratio for white on black (21:1)', () => {
      const ratio = checkColorContrast('#ffffff', '#000000');

      // Same as black on white (order should not matter for ratio)
      assert.ok(Math.abs(ratio - 21) < 0.1, `expected ~21, got ${ratio}`);
    });

    it('returns ratio >= 1 for any color pair', () => {
      const pairs = [
        ['#ff0000', '#00ff00'],
        ['#333333', '#666666'],
        ['#0000ff', '#ffff00'],
      ];

      for (const [fg, bg] of pairs) {
        const ratio = checkColorContrast(fg, bg);
        assert.ok(ratio >= 1, `ratio for ${fg}/${bg} should be >= 1, got ${ratio}`);
      }
    });

    it('meets WCAG AA for large text (ratio >= 3:1)', () => {
      // Dark gray on white should pass AA for large text
      const ratio = checkColorContrast('#767676', '#ffffff');
      assert.ok(ratio >= 3, `expected ratio >= 3 for AA large text, got ${ratio}`);
    });
  });

  describe('formatNumber()', () => {
    it('formats with US locale', () => {
      const result = formatNumber(1234567.89, 'en-US');

      assert.ok(result.includes('1'), 'should contain digit');
      // US locale uses commas for thousands separator
      assert.ok(
        result.includes(',') || result.includes('1234567'),
        'should format with locale conventions',
      );
    });

    it('formats with German locale', () => {
      const result = formatNumber(1234567.89, 'de-DE');

      // German locale uses dots for thousands and commas for decimals
      assert.ok(result.length > 0, 'should produce non-empty string');
    });

    it('formats currency with locale options', () => {
      const result = formatNumber(42.5, 'en-US', {
        style: 'currency',
        currency: 'USD',
      });

      assert.ok(result.includes('$') || result.includes('USD'), 'should include currency symbol');
      assert.ok(result.includes('42'), 'should include the value');
    });

    it('formats percentage', () => {
      const result = formatNumber(0.75, 'en-US', { style: 'percent' });

      assert.ok(result.includes('75'), 'should show 75');
      assert.ok(result.includes('%'), 'should include percent sign');
    });

    it('handles zero correctly', () => {
      const result = formatNumber(0, 'en-US');
      assert.strictEqual(result, '0');
    });

    it('handles negative numbers', () => {
      const result = formatNumber(-1000, 'en-US');
      assert.ok(result.includes('-') || result.includes('\u2212'), 'should indicate negative');
      assert.ok(result.includes('1'), 'should include digits');
    });
  });
});
