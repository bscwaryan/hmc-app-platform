// F-060: Data Loss Prevention
// Detect, warn, redact, or block sensitive data.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DlpRule {
  id: string;
  name: string;
  type: 'regex' | 'keyword' | 'entity' | 'pattern';
  pattern: string;
  action: 'warn' | 'redact' | 'block' | 'log';
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  enabled: boolean;
}

export interface DlpViolation {
  ruleId: string;
  ruleName: string;
  matchedText: string;
  position: { start: number; end: number };
  severity: string;
  action: string;
}

export interface DlpScanResult {
  content: string;
  violations: DlpViolation[];
  action: 'allow' | 'warn' | 'redact' | 'block';
  redactedContent?: string;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface DlpDbAdapter {
  getRules(tenantId?: string): Promise<DlpRule[]>;
  createRule(rule: DlpRule): Promise<DlpRule>;
  updateRule(id: string, updates: Partial<DlpRule>): Promise<DlpRule>;
  deleteRule(id: string): Promise<void>;
  logViolation(violation: DlpViolation): Promise<void>;
}

// ─── Built-in Rules ──────────────────────────────────────────────────────────

export const BUILT_IN_RULES: DlpRule[] = [
  {
    id: 'builtin-ssn',
    name: 'Social Security Number',
    type: 'regex',
    pattern: '\\d{3}-\\d{2}-\\d{4}',
    action: 'redact',
    severity: 'critical',
    category: 'pii',
    enabled: true,
  },
  {
    id: 'builtin-credit-card',
    name: 'Credit Card Number',
    type: 'regex',
    pattern: '\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}',
    action: 'redact',
    severity: 'critical',
    category: 'pci',
    enabled: true,
  },
  {
    id: 'builtin-email',
    name: 'Email Address',
    type: 'regex',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    action: 'warn',
    severity: 'medium',
    category: 'pii',
    enabled: true,
  },
  {
    id: 'builtin-phone',
    name: 'Phone Number',
    type: 'regex',
    pattern: '(?:\\+?1[-.]?)?\\(?\\d{3}\\)?[-.]?\\d{3}[-.]?\\d{4}',
    action: 'warn',
    severity: 'medium',
    category: 'pii',
    enabled: true,
  },
  {
    id: 'builtin-api-key-sk',
    name: 'API Key (sk-)',
    type: 'regex',
    pattern: 'sk-[a-zA-Z0-9]{20,}',
    action: 'block',
    severity: 'critical',
    category: 'secrets',
    enabled: true,
  },
  {
    id: 'builtin-api-key-ghp',
    name: 'GitHub Personal Access Token',
    type: 'regex',
    pattern: 'ghp_[a-zA-Z0-9]{36,}',
    action: 'block',
    severity: 'critical',
    category: 'secrets',
    enabled: true,
  },
  {
    id: 'builtin-api-key-aws',
    name: 'AWS Access Key',
    type: 'regex',
    pattern: 'AKIA[0-9A-Z]{16}',
    action: 'block',
    severity: 'critical',
    category: 'secrets',
    enabled: true,
  },
  {
    id: 'builtin-ip-address',
    name: 'IP Address',
    type: 'regex',
    pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b',
    action: 'log',
    severity: 'low',
    category: 'network',
    enabled: true,
  },
];

// ─── Action severity ranking ────────────────────────────────────────────────

const ACTION_SEVERITY: Record<string, number> = {
  log: 0,
  allow: 0,
  warn: 1,
  redact: 2,
  block: 3,
};

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Evaluates the most severe action from a list of violations.
 */
export function evaluateAction(violations: DlpViolation[]): 'allow' | 'warn' | 'redact' | 'block' {
  if (violations.length === 0) {
    return 'allow';
  }

  let maxSeverity = 0;
  let resultAction: 'allow' | 'warn' | 'redact' | 'block' = 'allow';

  for (const violation of violations) {
    const severity = ACTION_SEVERITY[violation.action] ?? 0;
    if (severity > maxSeverity) {
      maxSeverity = severity;
      resultAction = violation.action as 'allow' | 'warn' | 'redact' | 'block';
    }
  }

  return resultAction;
}

/**
 * Scans content against all provided DLP rules and returns violations.
 */
export function scanContent(content: string, rules: DlpRule[]): DlpScanResult {
  const violations: DlpViolation[] = [];

  for (const rule of rules) {
    if (!rule.enabled) {
      continue;
    }

    const regex = new RegExp(rule.pattern, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matchedText: match[0],
        position: { start: match.index, end: match.index + match[0].length },
        severity: rule.severity,
        action: rule.action,
      });
    }
  }

  const action = evaluateAction(violations);
  const result: DlpScanResult = {
    content,
    violations,
    action,
  };

  if (action === 'redact') {
    result.redactedContent = redactContent(content, violations);
  }

  return result;
}

/**
 * Replaces matched text with [REDACTED].
 */
export function redactContent(content: string, violations: DlpViolation[]): string {
  if (violations.length === 0) {
    return content;
  }

  // Sort violations by position descending so replacements don't shift indices
  const sorted = [...violations].sort((a, b) => b.position.start - a.position.start);

  let redacted = content;
  for (const violation of sorted) {
    const before = redacted.slice(0, violation.position.start);
    const after = redacted.slice(violation.position.end);
    redacted = before + '[REDACTED]' + after;
  }

  return redacted;
}

/**
 * Creates a middleware function that scans request bodies for DLP violations.
 */
export function createDlpMiddleware(rules: DlpRule[]): (body: string) => DlpScanResult {
  return (body: string): DlpScanResult => {
    return scanContent(body, rules);
  };
}
