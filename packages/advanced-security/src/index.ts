// F-062: Advanced Security
// Prompt injection detection, output filtering, network security, anomaly detection.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SecurityRule {
  id: string;
  type: 'prompt-injection' | 'output-filter' | 'ip-allowlist' | 'geofence' | 'anomaly';
  config: Record<string, unknown>;
  enabled: boolean;
}

export interface ThreatDetection {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  input: string;
  matchedPattern?: string;
  timestamp: string;
}

export interface IpAllowlistConfig {
  allowedIps: string[];
  allowedCidrs: string[];
  blockedIps: string[];
  blockedCountries: string[];
}

export interface AnomalyAlert {
  userId: string;
  type: string;
  description: string;
  score: number;
  threshold: number;
  metadata: Record<string, unknown>;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface SecurityDbAdapter {
  logThreat(detection: ThreatDetection): Promise<void>;
  getThreats(filters: Record<string, unknown>): Promise<ThreatDetection[]>;
  getIpConfig(tenantId: string): Promise<IpAllowlistConfig | null>;
  updateIpConfig(tenantId: string, config: IpAllowlistConfig): Promise<void>;
  getUserActivityProfile(userId: string): Promise<{
    averageActionsPerHour: number;
    commonActions: string[];
    lastActive: string;
    totalActions: number;
  } | null>;
  recordActivity(userId: string, action: string, metadata: Record<string, unknown>): Promise<void>;
}

// ─── Injection Patterns ──────────────────────────────────────────────────────

export const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp; severity: 'low' | 'medium' | 'high' | 'critical' }> = [
  {
    name: 'Ignore previous instructions',
    pattern: /ignore\s+(all\s+)?previous\s+instructions/i,
    severity: 'critical',
  },
  {
    name: 'You are now',
    pattern: /you\s+are\s+now\s+/i,
    severity: 'high',
  },
  {
    name: 'System prompt leak - reveal',
    pattern: /(?:reveal|show|display|print|output)\s+(?:your|the)\s+(?:system\s+)?prompt/i,
    severity: 'high',
  },
  {
    name: 'System prompt leak - what are your instructions',
    pattern: /what\s+(?:are|were)\s+your\s+(?:original\s+)?instructions/i,
    severity: 'high',
  },
  {
    name: 'Base64 encoded prompt',
    pattern: /(?:decode|execute|run|eval)\s+(?:this\s+)?base64/i,
    severity: 'critical',
  },
  {
    name: 'Delimiter injection - triple backtick',
    pattern: /```\s*(?:system|admin|root|sudo)/i,
    severity: 'high',
  },
  {
    name: 'Role-play attack - act as',
    pattern: /(?:act|behave|pretend|roleplay)\s+as\s+/i,
    severity: 'medium',
  },
  {
    name: 'Role-play attack - DAN',
    pattern: /\bDAN\b.*(?:do\s+anything\s+now|jailbreak)/i,
    severity: 'critical',
  },
  {
    name: 'Instruction override',
    pattern: /(?:override|bypass|disable|turn\s+off)\s+(?:your\s+)?(?:safety|filter|guard|restriction)/i,
    severity: 'critical',
  },
  {
    name: 'New system message',
    pattern: /\[(?:system|SYSTEM)\]/i,
    severity: 'high',
  },
  {
    name: 'Prompt leak - repeat everything',
    pattern: /repeat\s+(?:everything|all|the\s+text)\s+(?:above|before)/i,
    severity: 'medium',
  },
  {
    name: 'Developer mode',
    pattern: /(?:enter|enable|activate)\s+(?:developer|dev|debug)\s+mode/i,
    severity: 'high',
  },
  {
    name: 'Ignore safety',
    pattern: /ignore\s+(?:all\s+)?(?:safety|ethical|moral)\s+(?:guidelines|rules|constraints)/i,
    severity: 'critical',
  },
  {
    name: 'Token smuggling',
    pattern: /(?:token|boundary)\s+(?:smuggling|injection|manipulation)/i,
    severity: 'high',
  },
  {
    name: 'Hypothetical scenario bypass',
    pattern: /(?:hypothetically|theoretically|in\s+fiction)\s+(?:how\s+would|can\s+you|tell\s+me)/i,
    severity: 'low',
  },
];

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Detects prompt injection attacks in user input.
 */
export function detectPromptInjection(input: string): ThreatDetection | null {
  for (const pattern of INJECTION_PATTERNS) {
    const match = input.match(pattern.pattern);
    if (match) {
      return {
        type: 'prompt-injection',
        severity: pattern.severity,
        description: `Detected prompt injection: ${pattern.name}`,
        input,
        matchedPattern: pattern.name,
        timestamp: new Date().toISOString(),
      };
    }
  }

  return null;
}

/**
 * Filters output content by removing text matching any filter rules.
 */
export function filterOutput(
  output: string,
  rules: string[]
): { filtered: string; removedCount: number } {
  let filtered = output;
  let removedCount = 0;

  for (const rule of rules) {
    const regex = new RegExp(rule, 'gi');
    const matches = filtered.match(regex);
    if (matches) {
      removedCount += matches.length;
      filtered = filtered.replace(regex, '[FILTERED]');
    }
  }

  return { filtered, removedCount };
}

/**
 * Parses a CIDR notation string and returns a contains function.
 */
export function parseCIDR(cidr: string): {
  network: string;
  prefix: number;
  contains: (ip: string) => boolean;
} {
  const [network, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);

  const ipToNumber = (ip: string): number => {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  };

  const networkNum = ipToNumber(network);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const networkStart = (networkNum & mask) >>> 0;

  return {
    network,
    prefix,
    contains: (ip: string): boolean => {
      const ipNum = ipToNumber(ip);
      return ((ipNum & mask) >>> 0) === networkStart;
    },
  };
}

/**
 * Checks if an IP address is allowed based on the allowlist/blocklist config.
 */
export function checkIpAccess(
  ip: string,
  config: IpAllowlistConfig
): { allowed: boolean; reason?: string } {
  // Check blocked IPs first
  if (config.blockedIps.includes(ip)) {
    return { allowed: false, reason: 'IP is explicitly blocked' };
  }

  // Check allowed IPs
  if (config.allowedIps.length > 0 && config.allowedIps.includes(ip)) {
    return { allowed: true };
  }

  // Check allowed CIDRs
  for (const cidr of config.allowedCidrs) {
    const parsed = parseCIDR(cidr);
    if (parsed.contains(ip)) {
      return { allowed: true };
    }
  }

  // If there are allowedIps or allowedCidrs configured but IP didn't match any
  if (config.allowedIps.length > 0 || config.allowedCidrs.length > 0) {
    return { allowed: false, reason: 'IP not in allowlist' };
  }

  // If no allowlist is configured, allow by default
  return { allowed: true };
}

/**
 * Detects anomalous user behavior by comparing current action against historical profile.
 */
export async function detectAnomaly(
  adapter: SecurityDbAdapter,
  userId: string,
  action: string,
  metadata: Record<string, unknown>
): Promise<AnomalyAlert | null> {
  const profile = await adapter.getUserActivityProfile(userId);

  if (!profile) {
    // No historical data; cannot detect anomaly
    return null;
  }

  const threshold = 3.0; // Standard deviations from mean
  let anomalyScore = 0;

  // Check if action is uncommon for this user
  if (!profile.commonActions.includes(action)) {
    anomalyScore += 1.5;
  }

  // Check activity rate (simplified z-score approach)
  if (profile.averageActionsPerHour > 0) {
    const currentRate = (metadata.actionsInLastHour as number) || 0;
    const deviation = currentRate / profile.averageActionsPerHour;
    if (deviation > threshold) {
      anomalyScore += deviation - threshold;
    }
  }

  await adapter.recordActivity(userId, action, metadata);

  if (anomalyScore >= threshold) {
    return {
      userId,
      type: 'behavioral-anomaly',
      description: `Anomalous activity detected: ${action}`,
      score: anomalyScore,
      threshold,
      metadata,
    };
  }

  return null;
}

/**
 * Calculates a composite threat score (0-100) from a list of detections.
 */
export function rateScore(detections: ThreatDetection[]): number {
  if (detections.length === 0) {
    return 0;
  }

  const severityWeights: Record<string, number> = {
    low: 10,
    medium: 25,
    high: 50,
    critical: 80,
  };

  let totalScore = 0;
  for (const detection of detections) {
    totalScore += severityWeights[detection.severity] ?? 0;
  }

  return Math.min(100, totalScore);
}
