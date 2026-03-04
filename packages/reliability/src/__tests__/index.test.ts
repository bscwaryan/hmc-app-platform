import { describe, it } from 'node:test';
import assert from 'node:assert';

// ── Inline Implementations ───────────────────────────────────────────────────
// The reliability package source does not exist yet. These tests define the
// expected behaviour so the implementation can be verified once written.
// For now, we implement the core logic inline.

type CircuitState = 'closed' | 'open' | 'half-open';

class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private readonly threshold: number = 3,
    private readonly resetTimeoutMs: number = 5000,
    private readonly halfOpenSuccessThreshold: number = 2,
  ) {}

  getState(): CircuitState {
    if (this.state === 'open') {
      // Check if we should transition to half-open
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.state = 'half-open';
        this.successCount = 0;
      }
    }
    return this.state;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.state = 'closed';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === 'half-open') {
      this.state = 'open';
    } else if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }
}

/**
 * Executes an async function with retry logic.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 0,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries && baseDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, calculateBackoff(attempt, baseDelayMs)));
      }
    }
  }
  throw lastError;
}

/**
 * Calculates exponential backoff delay.
 */
function calculateBackoff(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * Math.pow(2, attempt);
}

/**
 * Checks if an error is retryable based on common patterns.
 */
function isRetryableError(error: Error): boolean {
  const retryablePatterns = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'socket hang up',
    'network error',
    'timeout',
    '429',
    '502',
    '503',
    '504',
  ];

  const message = error.message.toLowerCase();
  return retryablePatterns.some((pattern) => message.includes(pattern.toLowerCase()));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Reliability', () => {
  describe('CircuitBreaker', () => {
    it('starts in closed state', () => {
      const cb = new CircuitBreaker(3, 5000);
      assert.strictEqual(cb.getState(), 'closed');
    });

    it('transitions to open state after threshold failures', () => {
      const cb = new CircuitBreaker(3, 5000);

      cb.recordFailure();
      assert.strictEqual(cb.getState(), 'closed', 'should still be closed after 1 failure');

      cb.recordFailure();
      assert.strictEqual(cb.getState(), 'closed', 'should still be closed after 2 failures');

      cb.recordFailure();
      assert.strictEqual(cb.getState(), 'open', 'should be open after 3 failures');
    });

    it('transitions from open to half-open after reset timeout', () => {
      const cb = new CircuitBreaker(1, 0); // 0ms timeout for instant transition

      cb.recordFailure(); // Opens the circuit
      assert.strictEqual(cb.getState(), 'open');

      // With 0ms timeout, getState() should transition to half-open
      assert.strictEqual(cb.getState(), 'half-open');
    });

    it('transitions from half-open to closed after successes', () => {
      const cb = new CircuitBreaker(1, 0, 2); // threshold=1, timeout=0, halfOpenSuccess=2

      cb.recordFailure(); // Opens
      assert.strictEqual(cb.getState(), 'open');

      // Transition to half-open
      cb.getState(); // triggers transition to half-open
      assert.strictEqual(cb.getState(), 'half-open');

      cb.recordSuccess();
      assert.strictEqual(cb.getState(), 'half-open', 'still half-open after 1 success');

      cb.recordSuccess();
      assert.strictEqual(cb.getState(), 'closed', 'closed after 2 successes');
    });

    it('transitions from half-open back to open on failure', () => {
      const cb = new CircuitBreaker(1, 0, 2);

      cb.recordFailure(); // Opens
      cb.getState(); // half-open transition
      assert.strictEqual(cb.getState(), 'half-open');

      cb.recordFailure(); // Back to open
      assert.strictEqual(cb.getState(), 'open');
    });

    it('resets failure count on success in closed state', () => {
      const cb = new CircuitBreaker(3, 5000);

      cb.recordFailure();
      cb.recordFailure();
      cb.recordSuccess(); // Resets failure count

      // Two more failures should not open the circuit (count was reset)
      cb.recordFailure();
      cb.recordFailure();
      assert.strictEqual(cb.getState(), 'closed', 'should still be closed since count was reset');
    });
  });

  describe('withRetry()', () => {
    it('succeeds on first attempt', async () => {
      let calls = 0;
      const result = await withRetry(async () => {
        calls++;
        return 'success';
      }, 3);

      assert.strictEqual(result, 'success');
      assert.strictEqual(calls, 1, 'should only call once on success');
    });

    it('succeeds after transient failures', async () => {
      let calls = 0;
      const result = await withRetry(async () => {
        calls++;
        if (calls < 3) {
          throw new Error('transient error');
        }
        return 'eventual success';
      }, 3);

      assert.strictEqual(result, 'eventual success');
      assert.strictEqual(calls, 3, 'should have retried 3 times total');
    });

    it('throws after all retries exhausted', async () => {
      let calls = 0;
      await assert.rejects(
        async () => {
          await withRetry(async () => {
            calls++;
            throw new Error('persistent error');
          }, 2);
        },
        (err: Error) => {
          assert.strictEqual(err.message, 'persistent error');
          return true;
        },
      );

      assert.strictEqual(calls, 3, 'should have called 1 initial + 2 retries');
    });
  });

  describe('calculateBackoff()', () => {
    it('produces increasing delays with exponential backoff', () => {
      const baseDelay = 100;

      const delay0 = calculateBackoff(0, baseDelay);
      const delay1 = calculateBackoff(1, baseDelay);
      const delay2 = calculateBackoff(2, baseDelay);
      const delay3 = calculateBackoff(3, baseDelay);

      assert.strictEqual(delay0, 100, 'attempt 0: 100ms');
      assert.strictEqual(delay1, 200, 'attempt 1: 200ms');
      assert.strictEqual(delay2, 400, 'attempt 2: 400ms');
      assert.strictEqual(delay3, 800, 'attempt 3: 800ms');

      assert.ok(delay0 < delay1, 'delay should increase');
      assert.ok(delay1 < delay2, 'delay should increase');
      assert.ok(delay2 < delay3, 'delay should increase');
    });

    it('returns base delay for attempt 0', () => {
      assert.strictEqual(calculateBackoff(0, 50), 50);
      assert.strictEqual(calculateBackoff(0, 1000), 1000);
    });
  });

  describe('isRetryableError()', () => {
    it('matches ECONNREFUSED', () => {
      assert.strictEqual(isRetryableError(new Error('connect ECONNREFUSED 127.0.0.1:5432')), true);
    });

    it('matches ETIMEDOUT', () => {
      assert.strictEqual(isRetryableError(new Error('connect ETIMEDOUT')), true);
    });

    it('matches socket hang up', () => {
      assert.strictEqual(isRetryableError(new Error('socket hang up')), true);
    });

    it('matches 503 status', () => {
      assert.strictEqual(isRetryableError(new Error('Request failed with status 503')), true);
    });

    it('matches timeout', () => {
      assert.strictEqual(isRetryableError(new Error('Request timeout after 30000ms')), true);
    });

    it('does not match generic errors', () => {
      assert.strictEqual(isRetryableError(new Error('Invalid input')), false);
      assert.strictEqual(isRetryableError(new Error('Permission denied')), false);
      assert.strictEqual(isRetryableError(new Error('Not found')), false);
    });
  });
});
