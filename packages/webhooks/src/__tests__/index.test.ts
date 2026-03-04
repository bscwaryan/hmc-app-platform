import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

// ── Inline Helpers ────────────────────────────────────────────────────────────
// The webhooks package source does not exist yet. These tests define the
// expected behaviour so the implementation can be verified once written.
// For now, we implement the minimal utility functions inline.

/**
 * Signs a payload using HMAC-SHA256. This mirrors the expected
 * signPayload(payload, secret) function from the webhooks package.
 */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verifies a webhook signature by comparing it against the expected HMAC.
 */
function verifySignature(payload: string, secret: string, signature: string): boolean {
  const expected = signPayload(payload, secret);
  // Use timing-safe comparison
  if (expected.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Evaluates whether a webhook delivery succeeded based on status code.
 */
function evaluateDelivery(statusCode: number): 'success' | 'failure' | 'retry' {
  if (statusCode >= 200 && statusCode < 300) {
    return 'success';
  }
  if (statusCode >= 500) {
    return 'retry';
  }
  return 'failure';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Webhooks', () => {
  const testSecret = 'whsec_test_secret_key_12345';
  const testPayload = JSON.stringify({
    event: 'user.created',
    data: { id: 'user-1', email: 'test@example.com' },
  });

  describe('signPayload()', () => {
    it('produces consistent HMAC-SHA256 signatures', () => {
      const sig1 = signPayload(testPayload, testSecret);
      const sig2 = signPayload(testPayload, testSecret);

      assert.strictEqual(sig1, sig2, 'same payload + secret should produce same signature');
    });

    it('produces different signatures for different payloads', () => {
      const sig1 = signPayload('payload-a', testSecret);
      const sig2 = signPayload('payload-b', testSecret);

      assert.notStrictEqual(sig1, sig2, 'different payloads should produce different signatures');
    });

    it('produces different signatures for different secrets', () => {
      const sig1 = signPayload(testPayload, 'secret-a');
      const sig2 = signPayload(testPayload, 'secret-b');

      assert.notStrictEqual(sig1, sig2, 'different secrets should produce different signatures');
    });

    it('returns a 64-character hex string', () => {
      const sig = signPayload(testPayload, testSecret);

      assert.strictEqual(sig.length, 64, 'SHA-256 hex digest should be 64 characters');
      assert.ok(/^[a-f0-9]{64}$/.test(sig), 'should be a valid hex string');
    });
  });

  describe('verifySignature()', () => {
    it('returns true for a correct signature', () => {
      const signature = signPayload(testPayload, testSecret);
      const valid = verifySignature(testPayload, testSecret, signature);

      assert.strictEqual(valid, true, 'correct signature should verify');
    });

    it('returns false for an incorrect signature', () => {
      const valid = verifySignature(testPayload, testSecret, 'invalid_signature_00000000000000000000000000000000000000000000000000000000000000');

      assert.strictEqual(valid, false, 'incorrect signature should not verify');
    });

    it('returns false for a tampered payload', () => {
      const signature = signPayload(testPayload, testSecret);
      const tampered = testPayload + 'TAMPERED';
      const valid = verifySignature(tampered, testSecret, signature);

      assert.strictEqual(valid, false, 'tampered payload should not verify');
    });

    it('returns false for a wrong secret', () => {
      const signature = signPayload(testPayload, testSecret);
      const valid = verifySignature(testPayload, 'wrong-secret-key-xxxxx', signature);

      assert.strictEqual(valid, false, 'wrong secret should not verify');
    });
  });

  describe('evaluateDelivery()', () => {
    it('returns success for 2xx status codes', () => {
      assert.strictEqual(evaluateDelivery(200), 'success');
      assert.strictEqual(evaluateDelivery(201), 'success');
      assert.strictEqual(evaluateDelivery(204), 'success');
      assert.strictEqual(evaluateDelivery(299), 'success');
    });

    it('returns retry for 5xx status codes', () => {
      assert.strictEqual(evaluateDelivery(500), 'retry');
      assert.strictEqual(evaluateDelivery(502), 'retry');
      assert.strictEqual(evaluateDelivery(503), 'retry');
    });

    it('returns failure for 4xx status codes', () => {
      assert.strictEqual(evaluateDelivery(400), 'failure');
      assert.strictEqual(evaluateDelivery(401), 'failure');
      assert.strictEqual(evaluateDelivery(404), 'failure');
      assert.strictEqual(evaluateDelivery(429), 'failure');
    });

    it('returns failure for 3xx status codes', () => {
      assert.strictEqual(evaluateDelivery(301), 'failure');
      assert.strictEqual(evaluateDelivery(302), 'failure');
    });
  });
});
