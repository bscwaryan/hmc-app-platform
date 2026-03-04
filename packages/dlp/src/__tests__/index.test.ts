import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BUILT_IN_RULES,
  scanContent,
  redactContent,
  evaluateAction,
  type DlpViolation,
} from '../index.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DLP', () => {
  describe('BUILT_IN_RULES', () => {
    it('detects SSN pattern', () => {
      const ssnRule = BUILT_IN_RULES.find((r) => r.id === 'builtin-ssn');
      assert.ok(ssnRule, 'should have SSN rule');

      const regex = new RegExp(ssnRule.pattern);
      assert.ok(regex.test('123-45-6789'), 'should match SSN format');
      assert.ok(!regex.test('123456789'), 'should not match SSN without dashes');
      assert.ok(!regex.test('abc-de-fghi'), 'should not match non-numeric SSN');
    });

    it('detects credit card pattern', () => {
      const ccRule = BUILT_IN_RULES.find((r) => r.id === 'builtin-credit-card');
      assert.ok(ccRule, 'should have credit card rule');

      const regex = new RegExp(ccRule.pattern);
      assert.ok(regex.test('4111111111111111'), 'should match 16-digit card number');
      assert.ok(regex.test('4111-1111-1111-1111'), 'should match card number with dashes');
      assert.ok(regex.test('4111 1111 1111 1111'), 'should match card number with spaces');
    });

    it('detects email address pattern', () => {
      const emailRule = BUILT_IN_RULES.find((r) => r.id === 'builtin-email');
      assert.ok(emailRule, 'should have email rule');

      const regex = new RegExp(emailRule.pattern);
      assert.ok(regex.test('user@example.com'), 'should match basic email');
      assert.ok(regex.test('test.user+tag@domain.co.uk'), 'should match complex email');
    });

    it('detects API key (sk-) pattern', () => {
      const skRule = BUILT_IN_RULES.find((r) => r.id === 'builtin-api-key-sk');
      assert.ok(skRule, 'should have sk- API key rule');

      const regex = new RegExp(skRule.pattern);
      assert.ok(
        regex.test('sk-abcdefghijklmnopqrstu'),
        'should match sk- key with 21+ characters',
      );
      assert.ok(!regex.test('sk-short'), 'should not match short sk- key');
    });

    it('all built-in rules have required fields', () => {
      for (const rule of BUILT_IN_RULES) {
        assert.ok(rule.id, `rule should have id`);
        assert.ok(rule.name, `${rule.id} should have name`);
        assert.ok(rule.pattern, `${rule.id} should have pattern`);
        assert.ok(rule.action, `${rule.id} should have action`);
        assert.ok(rule.severity, `${rule.id} should have severity`);
        assert.ok(rule.category, `${rule.id} should have category`);
        assert.strictEqual(rule.enabled, true, `${rule.id} should be enabled`);
      }
    });
  });

  describe('scanContent()', () => {
    it('detects SSN in content', () => {
      const result = scanContent(
        'My SSN is 123-45-6789, please process it.',
        BUILT_IN_RULES,
      );

      const ssnViolation = result.violations.find((v) => v.ruleId === 'builtin-ssn');
      assert.ok(ssnViolation, 'should detect SSN violation');
      assert.strictEqual(ssnViolation.matchedText, '123-45-6789');
    });

    it('detects credit card in content', () => {
      const result = scanContent(
        'Card number: 4111-1111-1111-1111',
        BUILT_IN_RULES,
      );

      const ccViolation = result.violations.find((v) => v.ruleId === 'builtin-credit-card');
      assert.ok(ccViolation, 'should detect credit card violation');
    });

    it('returns allow action when no violations found', () => {
      const result = scanContent('This is safe content with no PII.', BUILT_IN_RULES);

      assert.strictEqual(result.action, 'allow');
      assert.strictEqual(result.violations.length, 0);
    });

    it('returns redacted content when action is redact', () => {
      const result = scanContent(
        'SSN: 123-45-6789',
        [BUILT_IN_RULES.find((r) => r.id === 'builtin-ssn')!],
      );

      assert.strictEqual(result.action, 'redact');
      assert.ok(result.redactedContent, 'should have redacted content');
      assert.ok(
        result.redactedContent!.includes('[REDACTED]'),
        'redacted content should contain [REDACTED]',
      );
      assert.ok(
        !result.redactedContent!.includes('123-45-6789'),
        'redacted content should not contain the SSN',
      );
    });

    it('skips disabled rules', () => {
      const disabledRule = { ...BUILT_IN_RULES[0], enabled: false };
      const result = scanContent('SSN: 123-45-6789', [disabledRule]);

      assert.strictEqual(result.violations.length, 0, 'should skip disabled rules');
      assert.strictEqual(result.action, 'allow');
    });

    it('detects multiple violations in one content', () => {
      const content = 'SSN: 123-45-6789, Card: 4111-1111-1111-1111, Email: user@test.com';
      const result = scanContent(content, BUILT_IN_RULES);

      assert.ok(result.violations.length >= 3, 'should detect at least 3 violations');
    });
  });

  describe('redactContent()', () => {
    it('replaces matched text with [REDACTED]', () => {
      const violations: DlpViolation[] = [
        {
          ruleId: 'test-rule',
          ruleName: 'Test',
          matchedText: 'sensitive-data',
          position: { start: 10, end: 24 },
          severity: 'high',
          action: 'redact',
        },
      ];

      const content = 'Prefix -- sensitive-data -- suffix';
      const result = redactContent(content, violations);

      assert.ok(result.includes('[REDACTED]'), 'should contain [REDACTED]');
      assert.ok(!result.includes('sensitive-data'), 'should not contain original text');
    });

    it('handles multiple violations at different positions', () => {
      const violations: DlpViolation[] = [
        {
          ruleId: 'r1',
          ruleName: 'Rule 1',
          matchedText: 'aaa',
          position: { start: 0, end: 3 },
          severity: 'high',
          action: 'redact',
        },
        {
          ruleId: 'r2',
          ruleName: 'Rule 2',
          matchedText: 'bbb',
          position: { start: 7, end: 10 },
          severity: 'high',
          action: 'redact',
        },
      ];

      const content = 'aaa -- bbb -- end';
      const result = redactContent(content, violations);

      assert.ok(!result.includes('aaa'), 'should redact first match');
      assert.ok(!result.includes('bbb'), 'should redact second match');
      assert.ok(result.includes('end'), 'should keep unmatched text');
    });

    it('returns original content when violations array is empty', () => {
      const content = 'nothing to redact';
      const result = redactContent(content, []);
      assert.strictEqual(result, content);
    });
  });

  describe('evaluateAction()', () => {
    it('returns allow when no violations', () => {
      assert.strictEqual(evaluateAction([]), 'allow');
    });

    it('returns the most severe action', () => {
      const violations: DlpViolation[] = [
        {
          ruleId: 'r1',
          ruleName: 'Rule 1',
          matchedText: 'a',
          position: { start: 0, end: 1 },
          severity: 'low',
          action: 'warn',
        },
        {
          ruleId: 'r2',
          ruleName: 'Rule 2',
          matchedText: 'b',
          position: { start: 2, end: 3 },
          severity: 'critical',
          action: 'block',
        },
        {
          ruleId: 'r3',
          ruleName: 'Rule 3',
          matchedText: 'c',
          position: { start: 4, end: 5 },
          severity: 'high',
          action: 'redact',
        },
      ];

      assert.strictEqual(evaluateAction(violations), 'block');
    });

    it('returns warn when that is the highest severity', () => {
      const violations: DlpViolation[] = [
        {
          ruleId: 'r1',
          ruleName: 'Rule 1',
          matchedText: 'a',
          position: { start: 0, end: 1 },
          severity: 'low',
          action: 'log',
        },
        {
          ruleId: 'r2',
          ruleName: 'Rule 2',
          matchedText: 'b',
          position: { start: 2, end: 3 },
          severity: 'medium',
          action: 'warn',
        },
      ];

      assert.strictEqual(evaluateAction(violations), 'warn');
    });

    it('returns redact when that is the highest severity', () => {
      const violations: DlpViolation[] = [
        {
          ruleId: 'r1',
          ruleName: 'Rule 1',
          matchedText: 'a',
          position: { start: 0, end: 1 },
          severity: 'low',
          action: 'warn',
        },
        {
          ruleId: 'r2',
          ruleName: 'Rule 2',
          matchedText: 'b',
          position: { start: 2, end: 3 },
          severity: 'high',
          action: 'redact',
        },
      ];

      assert.strictEqual(evaluateAction(violations), 'redact');
    });
  });
});
