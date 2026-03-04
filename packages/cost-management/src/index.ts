/**
 * @hmc/cost-management - LLM cost tracking with budgets (F-017)
 *
 * Provides:
 * - Usage recording with automatic cost calculation
 * - Budget tracking with threshold alerts
 * - Chargeback report generation by department
 * - Spending forecasting with linear projection
 * - Hardcoded pricing table for known LLM models
 *
 * Uses adapter pattern for database storage (database-agnostic).
 */

// ── Types ───────────────────────────────────────────────────────

export interface UsageRecord {
  userId: string;
  tenantId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: Date;
}

export interface Budget {
  id: string;
  tenantId: string;
  type: 'daily' | 'monthly' | 'quarterly';
  amount: number;
  currentSpend: number;
  period: string;
  alertThreshold: number;
}

export interface CostAllocation {
  department: string;
  period: string;
  totalCost: number;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byUser: Record<string, number>;
}

export interface ChargebackReport {
  period: string;
  allocations: CostAllocation[];
  generated: Date;
}

export interface ForecastResult {
  period: string;
  projectedCost: number;
  confidence: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  recommendations: string[];
}

// ── Adapter ─────────────────────────────────────────────────────

export interface CostDbAdapter {
  recordUsage(record: UsageRecord): Promise<void>;
  getUsage(filters: {
    tenantId?: string;
    userId?: string;
    provider?: string;
    model?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<UsageRecord[]>;
  getBudgets(tenantId: string): Promise<Budget[]>;
  createBudget(budget: Omit<Budget, 'id'>): Promise<Budget>;
  updateBudget(id: string, updates: Partial<Budget>): Promise<Budget>;
  getBudgetStatus(tenantId: string): Promise<Budget[]>;
  getCostAllocations(tenantId: string, period: string): Promise<CostAllocation[]>;
  getDailySpend(tenantId: string, startDate: Date, endDate: Date): Promise<Array<{ date: string; cost: number }>>;
}

// ── Pricing Table ───────────────────────────────────────────────

export const MODEL_PRICING: Record<string, Record<string, { inputPer1k: number; outputPer1k: number }>> = {
  openai: {
    'gpt-4o': { inputPer1k: 0.0025, outputPer1k: 0.01 },
    'gpt-4o-mini': { inputPer1k: 0.00015, outputPer1k: 0.0006 },
    'gpt-4-turbo': { inputPer1k: 0.01, outputPer1k: 0.03 },
    'gpt-4': { inputPer1k: 0.03, outputPer1k: 0.06 },
    'gpt-3.5-turbo': { inputPer1k: 0.0005, outputPer1k: 0.0015 },
    'o1': { inputPer1k: 0.015, outputPer1k: 0.06 },
    'o1-mini': { inputPer1k: 0.003, outputPer1k: 0.012 },
  },
  anthropic: {
    'claude-opus-4': { inputPer1k: 0.015, outputPer1k: 0.075 },
    'claude-sonnet-4': { inputPer1k: 0.003, outputPer1k: 0.015 },
    'claude-3-5-sonnet': { inputPer1k: 0.003, outputPer1k: 0.015 },
    'claude-3-5-haiku': { inputPer1k: 0.0008, outputPer1k: 0.004 },
    'claude-3-opus': { inputPer1k: 0.015, outputPer1k: 0.075 },
    'claude-3-haiku': { inputPer1k: 0.00025, outputPer1k: 0.00125 },
  },
  google: {
    'gemini-2.0-flash': { inputPer1k: 0.0001, outputPer1k: 0.0004 },
    'gemini-1.5-pro': { inputPer1k: 0.00125, outputPer1k: 0.005 },
    'gemini-1.5-flash': { inputPer1k: 0.000075, outputPer1k: 0.0003 },
  },
};

// ── Business Logic ──────────────────────────────────────────────

/**
 * Calculate the cost for a given model usage based on the pricing table.
 */
export function calculateTokenCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const providerPricing = MODEL_PRICING[provider];
  if (!providerPricing) {
    return 0;
  }

  const modelPricing = providerPricing[model];
  if (!modelPricing) {
    return 0;
  }

  const inputCost = (inputTokens / 1000) * modelPricing.inputPer1k;
  const outputCost = (outputTokens / 1000) * modelPricing.outputPer1k;

  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/**
 * Track a usage record and check against budgets.
 */
export async function trackUsage(
  adapter: CostDbAdapter,
  record: UsageRecord,
): Promise<{ recorded: boolean; budgetWarning?: string }> {
  await adapter.recordUsage(record);

  const budgets = await adapter.getBudgetStatus(record.tenantId);
  for (const budget of budgets) {
    const percentUsed = budget.currentSpend / budget.amount;
    if (percentUsed >= budget.alertThreshold) {
      return {
        recorded: true,
        budgetWarning: `${budget.type} budget is at ${Math.round(percentUsed * 100)}% (${budget.currentSpend.toFixed(2)}/${budget.amount.toFixed(2)})`,
      };
    }
  }

  return { recorded: true };
}

/**
 * Get the status of all budgets for a tenant.
 */
export async function getBudgetStatus(
  adapter: CostDbAdapter,
  tenantId: string,
): Promise<Array<{ budget: Budget; percentUsed: number; remaining: number; onTrack: boolean }>> {
  const budgets = await adapter.getBudgets(tenantId);

  return budgets.map((budget) => {
    const percentUsed = budget.amount > 0 ? budget.currentSpend / budget.amount : 0;
    const remaining = Math.max(0, budget.amount - budget.currentSpend);

    let onTrack = true;
    if (budget.type === 'daily') {
      onTrack = percentUsed <= 1.0;
    } else if (budget.type === 'monthly') {
      const now = new Date();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const expectedPercent = dayOfMonth / daysInMonth;
      onTrack = percentUsed <= expectedPercent * 1.2;
    } else if (budget.type === 'quarterly') {
      const now = new Date();
      const quarterMonth = now.getMonth() % 3;
      const dayOfMonth = now.getDate();
      const daysInQuarterMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const expectedPercent = (quarterMonth * 30 + dayOfMonth) / (90);
      const _ = daysInQuarterMonth; // Used for more precise calculation if needed
      onTrack = percentUsed <= expectedPercent * 1.2;
    }

    return { budget, percentUsed, remaining, onTrack };
  });
}

/**
 * Generate a chargeback report for a tenant and period.
 */
export async function generateChargebackReport(
  adapter: CostDbAdapter,
  tenantId: string,
  period: string,
): Promise<ChargebackReport> {
  const allocations = await adapter.getCostAllocations(tenantId, period);

  return {
    period,
    allocations,
    generated: new Date(),
  };
}

/**
 * Forecast spending using basic linear projection.
 */
export async function forecastSpending(
  adapter: CostDbAdapter,
  tenantId: string,
  days: number,
): Promise<ForecastResult> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const dailySpend = await adapter.getDailySpend(tenantId, startDate, endDate);

  if (dailySpend.length === 0) {
    return {
      period: `${days} days`,
      projectedCost: 0,
      confidence: 0,
      trend: 'stable',
      recommendations: ['No spending data available for forecasting.'],
    };
  }

  const costs = dailySpend.map((d) => d.cost);
  const avgDailyCost = costs.reduce((sum, c) => sum + c, 0) / costs.length;
  const projectedCost = Math.round(avgDailyCost * days * 100) / 100;

  // Calculate trend using simple slope
  let slope = 0;
  if (costs.length >= 2) {
    const n = costs.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += costs[i];
      sumXY += i * costs[i];
      sumX2 += i * i;
    }
    slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  let trend: ForecastResult['trend'] = 'stable';
  if (slope > avgDailyCost * 0.05) {
    trend = 'increasing';
  } else if (slope < -avgDailyCost * 0.05) {
    trend = 'decreasing';
  }

  const confidence = Math.min(0.95, costs.length / 30);

  const recommendations: string[] = [];
  if (trend === 'increasing') {
    recommendations.push('Spending is trending upward. Consider reviewing usage patterns.');
    recommendations.push('Evaluate if lower-cost models can be used for some workloads.');
  }
  if (projectedCost > avgDailyCost * days * 1.5) {
    recommendations.push('Projected spend is significantly above average. Review budget allocations.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Spending is within expected range.');
  }

  return {
    period: `${days} days`,
    projectedCost,
    confidence,
    trend,
    recommendations,
  };
}
