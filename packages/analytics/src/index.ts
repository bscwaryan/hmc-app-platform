/**
 * @hmc/analytics - Configurable analytics dashboard (F-018)
 *
 * Provides:
 * - Widget management for dashboard customization
 * - Trend calculation from time-series data
 * - Metric aggregation by time interval
 * - Period-over-period comparison
 * - Default dashboard configuration
 *
 * Uses adapter pattern for database storage (database-agnostic).
 */

// ── Types ───────────────────────────────────────────────────────

export type WidgetType = 'counter' | 'chart' | 'table' | 'list' | 'progress' | 'heatmap';

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  dataSource: string;
  config: Record<string, unknown>;
  size: 'sm' | 'md' | 'lg' | 'xl';
}

export interface DashboardLayout {
  userId: string;
  widgets: Array<{
    widgetId: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }>;
}

export interface MetricDataPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface AggregatedMetric {
  name: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
}

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d' | '1y' | 'custom';

// ── Adapter ─────────────────────────────────────────────────────

export interface AnalyticsDbAdapter {
  getWidgets(dashboardId: string): Promise<Widget[]>;
  createWidget(widget: Omit<Widget, 'id'>): Promise<Widget>;
  updateWidget(id: string, widget: Partial<Widget>): Promise<Widget>;
  deleteWidget(id: string): Promise<void>;
  getUserLayout(userId: string): Promise<DashboardLayout | null>;
  saveUserLayout(userId: string, layout: DashboardLayout): Promise<void>;
  getMetricData(source: string, timeRange: TimeRange): Promise<MetricDataPoint[]>;
  getAggregatedMetrics(sources: string[], timeRange: TimeRange): Promise<AggregatedMetric[]>;
}

// ── Constants ───────────────────────────────────────────────────

export const TIME_RANGES: readonly { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
] as const;

// ── Business Logic ──────────────────────────────────────────────

/**
 * Returns a default set of dashboard widgets.
 */
export function getDefaultDashboard(): Widget[] {
  return [
    {
      id: 'widget-total-users',
      type: 'counter',
      title: 'Total Users',
      dataSource: 'metrics.users.total',
      config: { icon: 'users', format: 'number' },
      size: 'sm',
    },
    {
      id: 'widget-active-sessions',
      type: 'counter',
      title: 'Active Sessions',
      dataSource: 'metrics.sessions.active',
      config: { icon: 'activity', format: 'number' },
      size: 'sm',
    },
    {
      id: 'widget-api-requests',
      type: 'chart',
      title: 'API Requests',
      dataSource: 'metrics.api.requests',
      config: { chartType: 'line', showLegend: true },
      size: 'lg',
    },
    {
      id: 'widget-error-rate',
      type: 'progress',
      title: 'Error Rate',
      dataSource: 'metrics.api.errorRate',
      config: { threshold: 5, unit: '%' },
      size: 'sm',
    },
    {
      id: 'widget-top-endpoints',
      type: 'table',
      title: 'Top Endpoints',
      dataSource: 'metrics.api.topEndpoints',
      config: { columns: ['endpoint', 'count', 'avgLatency'] },
      size: 'md',
    },
    {
      id: 'widget-usage-heatmap',
      type: 'heatmap',
      title: 'Usage Heatmap',
      dataSource: 'metrics.usage.byHour',
      config: { colorScale: 'blue' },
      size: 'lg',
    },
  ];
}

/**
 * Calculate the trend direction and slope from a series of data points.
 */
export function calculateTrend(
  dataPoints: MetricDataPoint[],
): { direction: string; slope: number; confidence: number } {
  if (dataPoints.length < 2) {
    return { direction: 'flat', slope: 0, confidence: 0 };
  }

  const n = dataPoints.length;
  const sorted = [...dataPoints].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );

  // Normalize timestamps to indices for linear regression
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = sorted[i].value;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
    sumY2 += y * y;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return { direction: 'flat', slope: 0, confidence: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;

  // R-squared for confidence
  const yMean = sumY / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = (sumY / n) + slope * (i - sumX / n);
    ssRes += (sorted[i].value - predicted) ** 2;
    ssTot += (sorted[i].value - yMean) ** 2;
  }

  const confidence = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

  const avgValue = sumY / n;
  const threshold = Math.abs(avgValue) * 0.01;

  let direction: string;
  if (Math.abs(slope) < threshold) {
    direction = 'flat';
  } else if (slope > 0) {
    direction = 'up';
  } else {
    direction = 'down';
  }

  return { direction, slope, confidence };
}

/**
 * Aggregate data points by time interval (hour, day, week, month).
 */
export function aggregateMetrics(
  dataPoints: MetricDataPoint[],
  interval: string,
): MetricDataPoint[] {
  if (dataPoints.length === 0) {
    return [];
  }

  const buckets = new Map<string, { sum: number; count: number; timestamp: Date }>();

  for (const point of dataPoints) {
    const key = getBucketKey(point.timestamp, interval);
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += point.value;
      existing.count += 1;
    } else {
      buckets.set(key, {
        sum: point.value,
        count: 1,
        timestamp: getBucketTimestamp(point.timestamp, interval),
      });
    }
  }

  const result: MetricDataPoint[] = [];
  for (const [, bucket] of buckets) {
    result.push({
      timestamp: bucket.timestamp,
      value: bucket.sum,
      label: undefined,
    });
  }

  return result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

function getBucketKey(date: Date, interval: string): string {
  const d = new Date(date);
  switch (interval) {
    case 'hour':
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
    case 'day':
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    case 'week': {
      const startOfWeek = new Date(d);
      startOfWeek.setDate(d.getDate() - d.getDay());
      return `${startOfWeek.getFullYear()}-${startOfWeek.getMonth()}-${startOfWeek.getDate()}`;
    }
    case 'month':
      return `${d.getFullYear()}-${d.getMonth()}`;
    default:
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }
}

function getBucketTimestamp(date: Date, interval: string): Date {
  const d = new Date(date);
  switch (interval) {
    case 'hour':
      d.setMinutes(0, 0, 0);
      return d;
    case 'day':
      d.setHours(0, 0, 0, 0);
      return d;
    case 'week': {
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month':
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    default:
      d.setHours(0, 0, 0, 0);
      return d;
  }
}

/**
 * Compare two periods of metric data to produce an aggregated metric.
 */
export function comparePeriods(
  current: MetricDataPoint[],
  previous: MetricDataPoint[],
): AggregatedMetric {
  const currentTotal = current.reduce((sum, p) => sum + p.value, 0);
  const previousTotal = previous.reduce((sum, p) => sum + p.value, 0);
  const change = currentTotal - previousTotal;
  const changePercent = previousTotal === 0 ? 0 : (change / previousTotal) * 100;

  let trend: AggregatedMetric['trend'];
  if (Math.abs(changePercent) < 1) {
    trend = 'flat';
  } else if (change > 0) {
    trend = 'up';
  } else {
    trend = 'down';
  }

  return {
    name: '',
    current: currentTotal,
    previous: previousTotal,
    change,
    changePercent: Math.round(changePercent * 100) / 100,
    trend,
  };
}
