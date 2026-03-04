// F-066: Reliability
// Circuit breakers, retry policies, backups, health patterns.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenRequests: number;
  monitorWindowMs: number;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreaker {
  config: CircuitBreakerConfig;
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailure?: string;
  nextRetryAt?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: string[];
}

export interface BackupConfig {
  id: string;
  name: string;
  schedule: string;
  retention: number;
  target: string;
  lastBackup?: string;
  nextBackup?: string;
}

export interface BackupResult {
  configId: string;
  success: boolean;
  size?: number;
  duration?: number;
  error?: string;
  timestamp: string;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface ReliabilityDbAdapter {
  getCircuitBreakerState(name: string): Promise<CircuitBreaker | null>;
  updateCircuitBreakerState(name: string, state: CircuitBreaker): Promise<void>;
  getBackupConfigs(): Promise<BackupConfig[]>;
  getBackupResults(configId: string, limit?: number): Promise<BackupResult[]>;
  logBackupResult(result: BackupResult): Promise<void>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

export const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  name: 'default',
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenRequests: 3,
  monitorWindowMs: 60000,
};

// ─── Retryable Error Detection ───────────────────────────────────────────────

const DEFAULT_RETRYABLE_PATTERNS = [
  'timeout',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  '502',
  '503',
  '429',
];

/**
 * Checks if an error matches retryable patterns.
 */
export function isRetryableError(
  error: unknown,
  retryablePatterns?: string[]
): boolean {
  const patterns = retryablePatterns ?? DEFAULT_RETRYABLE_PATTERNS;
  const message = error instanceof Error ? error.message : String(error);

  return patterns.some((pattern) => message.includes(pattern));
}

// ─── Backoff Calculation ─────────────────────────────────────────────────────

/**
 * Calculates the backoff delay for a given attempt, optionally adding jitter.
 */
export function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  const exponentialDelay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt);
  const clampedDelay = Math.min(exponentialDelay, policy.maxDelayMs);

  if (policy.jitter) {
    // Full jitter: random value between 0 and clampedDelay
    return Math.floor(Math.random() * clampedDelay);
  }

  return clampedDelay;
}

// ─── Retry Function ──────────────────────────────────────────────────────────

/**
 * Retries a function with exponential backoff according to the given policy.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= policy.maxRetries) {
        break;
      }

      if (!isRetryableError(error, policy.retryableErrors)) {
        break;
      }

      const delay = calculateBackoff(attempt, policy);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

/**
 * Creates a circuit breaker with the full closed -> open -> half-open state machine.
 *
 * Closed: Normal operation, counts failures.
 * Open: Rejects immediately after failure threshold reached.
 * Half-open: Allows limited requests after timeout to test recovery.
 */
export function createCircuitBreaker(config: CircuitBreakerConfig): {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitBreakerState;
  reset(): void;
} {
  let state: CircuitBreakerState = 'closed';
  let failures = 0;
  let successes = 0;
  let halfOpenAttempts = 0;
  let lastFailureTime: number | null = null;
  let windowStart = Date.now();

  const resetCounters = (): void => {
    failures = 0;
    successes = 0;
    halfOpenAttempts = 0;
    lastFailureTime = null;
    windowStart = Date.now();
  };

  const transitionTo = (newState: CircuitBreakerState): void => {
    state = newState;
    if (newState === 'closed') {
      resetCounters();
    } else if (newState === 'half-open') {
      halfOpenAttempts = 0;
      successes = 0;
    }
  };

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      // Check if monitor window has elapsed, reset failure count
      if (state === 'closed' && Date.now() - windowStart > config.monitorWindowMs) {
        failures = 0;
        windowStart = Date.now();
      }

      // If open, check if enough time has passed to try half-open
      if (state === 'open') {
        if (lastFailureTime && Date.now() - lastFailureTime >= config.resetTimeoutMs) {
          transitionTo('half-open');
        } else {
          throw new Error(`Circuit breaker "${config.name}" is open`);
        }
      }

      // If half-open, check if we've exceeded allowed requests
      if (state === 'half-open' && halfOpenAttempts >= config.halfOpenRequests) {
        throw new Error(`Circuit breaker "${config.name}" is half-open and at capacity`);
      }

      if (state === 'half-open') {
        halfOpenAttempts++;
      }

      try {
        const result = await fn();

        if (state === 'half-open') {
          successes++;
          if (successes >= config.halfOpenRequests) {
            transitionTo('closed');
          }
        }

        return result;
      } catch (error) {
        failures++;
        lastFailureTime = Date.now();

        if (state === 'half-open') {
          // Any failure in half-open goes back to open
          transitionTo('open');
          lastFailureTime = Date.now();
        } else if (state === 'closed' && failures >= config.failureThreshold) {
          transitionTo('open');
          lastFailureTime = Date.now();
        }

        throw error;
      }
    },

    getState(): CircuitBreakerState {
      // Check for automatic transition from open to half-open
      if (state === 'open' && lastFailureTime && Date.now() - lastFailureTime >= config.resetTimeoutMs) {
        transitionTo('half-open');
      }
      return state;
    },

    reset(): void {
      transitionTo('closed');
    },
  };
}

// ─── Bulkhead ────────────────────────────────────────────────────────────────

/**
 * Creates a bulkhead that limits concurrent executions.
 */
export function createBulkhead(maxConcurrent: number): {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  pending: number;
  active: number;
} {
  let active = 0;
  const queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];

  const processQueue = (): void => {
    while (queue.length > 0 && active < maxConcurrent) {
      const item = queue.shift();
      if (!item) break;

      active++;
      item
        .fn()
        .then((result) => {
          active--;
          item.resolve(result);
          processQueue();
        })
        .catch((error) => {
          active--;
          item.reject(error);
          processQueue();
        });
    }
  };

  return {
    execute<T>(fn: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push({
          fn: fn as () => Promise<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        processQueue();
      });
    },

    get pending(): number {
      return queue.length;
    },

    get active(): number {
      return active;
    },
  };
}
