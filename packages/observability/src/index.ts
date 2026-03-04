// F-065: Observability
// Prometheus metrics, OpenTelemetry tracing, request logging, web vitals.

import { randomBytes } from 'node:crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  value: number;
  labels: Record<string, string>;
  timestamp: string;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: number;
  endTime?: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface WebVital {
  name: 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  url: string;
  timestamp: string;
}

export interface RequestLog {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  ip?: string;
  userId?: string;
  timestamp: string;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface ObservabilityDbAdapter {
  recordMetric(metric: Metric): Promise<void>;
  getMetrics(name: string, timeRange: { start: string; end: string }): Promise<Metric[]>;
  recordSpan(span: TraceSpan): Promise<void>;
  getTrace(traceId: string): Promise<TraceSpan[]>;
  recordWebVital(vital: WebVital): Promise<void>;
  getWebVitals(timeRange: { start: string; end: string }): Promise<WebVital[]>;
  recordRequestLog(log: RequestLog): Promise<void>;
  getRequestLogs(filters: Record<string, unknown>): Promise<RequestLog[]>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Web Vital thresholds based on Google's Core Web Vitals guidelines.
 */
export const WEB_VITAL_THRESHOLDS: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
  INP: { good: 200, poor: 500 },
};

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Creates a counter metric that can only be incremented.
 */
export function createCounter(
  name: string,
  labels: Record<string, string> = {}
): { increment(value?: number): Metric } {
  let currentValue = 0;

  return {
    increment(value: number = 1): Metric {
      currentValue += value;
      return {
        name,
        type: 'counter',
        value: currentValue,
        labels,
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Creates a gauge metric that can be set, incremented, or decremented.
 */
export function createGauge(
  name: string,
  labels: Record<string, string> = {}
): {
  set(value: number): Metric;
  increment(value?: number): Metric;
  decrement(value?: number): Metric;
} {
  let currentValue = 0;

  const createMetric = (): Metric => ({
    name,
    type: 'gauge',
    value: currentValue,
    labels,
    timestamp: new Date().toISOString(),
  });

  return {
    set(value: number): Metric {
      currentValue = value;
      return createMetric();
    },
    increment(value: number = 1): Metric {
      currentValue += value;
      return createMetric();
    },
    decrement(value: number = 1): Metric {
      currentValue -= value;
      return createMetric();
    },
  };
}

/**
 * Creates a histogram metric that observes values into buckets.
 */
export function createHistogram(
  name: string,
  buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
): { observe(value: number, labels?: Record<string, string>): Metric } {
  return {
    observe(value: number, labels: Record<string, string> = {}): Metric {
      return {
        name,
        type: 'histogram',
        value,
        labels: {
          ...labels,
          le: String(buckets.find((b) => value <= b) ?? '+Inf'),
        },
        timestamp: new Date().toISOString(),
      };
    },
  };
}

/**
 * Starts a new trace span with automatic ID generation.
 */
export function startSpan(
  name: string,
  opts: { traceId?: string; parentSpanId?: string; service?: string } = {}
): {
  span: TraceSpan;
  end(status?: 'ok' | 'error'): TraceSpan;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
} {
  const span: TraceSpan = {
    traceId: opts.traceId ?? randomBytes(16).toString('hex'),
    spanId: randomBytes(8).toString('hex'),
    parentSpanId: opts.parentSpanId,
    name,
    service: opts.service ?? 'unknown',
    startTime: performance.now(),
    status: 'unset',
    attributes: {},
    events: [],
  };

  return {
    span,

    end(status: 'ok' | 'error' = 'ok'): TraceSpan {
      span.endTime = performance.now();
      span.status = status;
      return span;
    },

    addEvent(eventName: string, attributes?: Record<string, unknown>): void {
      span.events.push({
        name: eventName,
        timestamp: performance.now(),
        attributes,
      });
    },
  };
}

/**
 * Formats metrics in Prometheus exposition format.
 */
export function formatPrometheus(metrics: Metric[]): string {
  const lines: string[] = [];
  const seenTypes = new Set<string>();

  for (const metric of metrics) {
    if (!seenTypes.has(metric.name)) {
      lines.push(`# HELP ${metric.name} ${metric.name}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);
      seenTypes.add(metric.name);
    }

    const labelParts = Object.entries(metric.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    const labelStr = labelParts ? `{${labelParts}}` : '';
    lines.push(`${metric.name}${labelStr} ${metric.value}`);
  }

  return lines.join('\n');
}

/**
 * Creates a request logger middleware-style function.
 */
export function createRequestLogger(): (req: {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userAgent?: string;
  ip?: string;
  userId?: string;
}) => RequestLog {
  return (req): RequestLog => {
    return {
      method: req.method,
      path: req.path,
      statusCode: req.statusCode,
      duration: req.duration,
      userAgent: req.userAgent,
      ip: req.ip,
      userId: req.userId,
      timestamp: new Date().toISOString(),
    };
  };
}

/**
 * Rates a web vital value according to Google's Core Web Vitals thresholds.
 */
export function rateWebVital(
  name: string,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const thresholds = WEB_VITAL_THRESHOLDS[name];

  if (!thresholds) {
    return 'needs-improvement';
  }

  if (value <= thresholds.good) {
    return 'good';
  }

  if (value <= thresholds.poor) {
    return 'needs-improvement';
  }

  return 'poor';
}
