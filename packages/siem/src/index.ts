// F-063: SIEM Integration
// Forward security events to Splunk, Sentinel, syslog, or webhooks.

// ─── Types ───────────────────────────────────────────────────────────────────

export type SiemProvider = 'splunk' | 'sentinel' | 'syslog' | 'webhook' | 'custom';

export interface SiemConfig {
  id: string;
  tenantId: string;
  provider: SiemProvider;
  endpoint: string;
  authConfig: Record<string, string>;
  enabled: boolean;
  batchSize: number;
  flushIntervalMs: number;
  retryConfig: {
    maxRetries: number;
    backoffMs: number;
  };
}

export interface SecurityEvent {
  id: string;
  tenantId: string;
  timestamp: string;
  eventType: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  actor?: {
    userId: string;
    ip: string;
  };
  target?: {
    type: string;
    id: string;
  };
  details: Record<string, unknown>;
}

export interface DeliveryResult {
  eventId: string;
  provider: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  timestamp: string;
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

export interface SiemDbAdapter {
  getConfigs(tenantId: string): Promise<SiemConfig[]>;
  createConfig(config: SiemConfig): Promise<SiemConfig>;
  updateConfig(id: string, updates: Partial<SiemConfig>): Promise<SiemConfig>;
  deleteConfig(id: string): Promise<void>;
  logDelivery(result: DeliveryResult): Promise<void>;
  getDeadLetterEvents(tenantId: string): Promise<SecurityEvent[]>;
  retryDeadLetterEvent(eventId: string): Promise<void>;
}

// ─── Severity Map ────────────────────────────────────────────────────────────

/**
 * Maps internal severity levels to syslog severity levels (RFC 5424).
 * Lower number = higher severity.
 */
export const SEVERITY_MAP: Record<string, number> = {
  critical: 2, // Critical
  error: 3,    // Error
  warning: 4,  // Warning
  info: 6,     // Informational
};

// ─── Format Functions ────────────────────────────────────────────────────────

/**
 * Formats a security event as Splunk HEC JSON.
 */
export function formatForSplunk(event: SecurityEvent): string {
  const splunkEvent = {
    time: new Date(event.timestamp).getTime() / 1000,
    host: event.source,
    source: event.source,
    sourcetype: '_json',
    event: {
      id: event.id,
      tenantId: event.tenantId,
      eventType: event.eventType,
      severity: event.severity,
      actor: event.actor,
      target: event.target,
      details: event.details,
    },
  };

  return JSON.stringify(splunkEvent);
}

/**
 * Formats a security event for Azure Sentinel API.
 */
export function formatForSentinel(event: SecurityEvent): string {
  const sentinelEvent = {
    TimeGenerated: event.timestamp,
    TenantId: event.tenantId,
    EventType: event.eventType,
    Severity: event.severity,
    Source: event.source,
    ActorUserId: event.actor?.userId,
    ActorIP: event.actor?.ip,
    TargetType: event.target?.type,
    TargetId: event.target?.id,
    Details: JSON.stringify(event.details),
    EventId: event.id,
  };

  return JSON.stringify(sentinelEvent);
}

/**
 * Formats a security event in RFC 5424 syslog format.
 */
export function formatForSyslog(event: SecurityEvent): string {
  const severity = SEVERITY_MAP[event.severity] ?? 6;
  const facility = 4; // security/authorization
  const priority = facility * 8 + severity;
  const version = 1;
  const timestamp = event.timestamp;
  const hostname = event.source || '-';
  const appName = 'hmc-security';
  const procId = '-';
  const msgId = event.eventType;
  const structuredData = '-';
  const msg = JSON.stringify({
    id: event.id,
    tenantId: event.tenantId,
    actor: event.actor,
    target: event.target,
    details: event.details,
  });

  return `<${priority}>${version} ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${structuredData} ${msg}`;
}

// ─── Delivery Functions ──────────────────────────────────────────────────────

/**
 * Forwards a single security event to the configured SIEM provider.
 */
export async function forwardEvent(
  config: SiemConfig,
  event: SecurityEvent
): Promise<DeliveryResult> {
  let formattedPayload: string;

  switch (config.provider) {
    case 'splunk':
      formattedPayload = formatForSplunk(event);
      break;
    case 'sentinel':
      formattedPayload = formatForSentinel(event);
      break;
    case 'syslog':
      formattedPayload = formatForSyslog(event);
      break;
    case 'webhook':
    case 'custom':
      formattedPayload = JSON.stringify(event);
      break;
  }

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.authConfig,
      },
      body: formattedPayload,
    });

    return {
      eventId: event.id,
      provider: config.provider,
      success: response.ok,
      statusCode: response.status,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      eventId: event.id,
      provider: config.provider,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Forwards a batch of security events.
 */
export async function batchForward(
  config: SiemConfig,
  events: SecurityEvent[]
): Promise<DeliveryResult[]> {
  const results: DeliveryResult[] = [];

  for (const event of events) {
    const result = await forwardEvent(config, event);
    results.push(result);
  }

  return results;
}

/**
 * Creates a SIEM forwarder with batching and retry capabilities.
 */
export function createSiemForwarder(config: SiemConfig): {
  forward(event: SecurityEvent): Promise<DeliveryResult>;
  flush(): Promise<DeliveryResult[]>;
  shutdown(): Promise<void>;
} {
  let buffer: SecurityEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let isShutdown = false;

  const scheduleFlush = (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
      void flush();
    }, config.flushIntervalMs);
  };

  const retryWithBackoff = async (
    event: SecurityEvent,
    attempt: number
  ): Promise<DeliveryResult> => {
    const result = await forwardEvent(config, event);

    if (!result.success && attempt < config.retryConfig.maxRetries) {
      const delay = config.retryConfig.backoffMs * Math.pow(2, attempt);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      return retryWithBackoff(event, attempt + 1);
    }

    return result;
  };

  const flush = async (): Promise<DeliveryResult[]> => {
    if (buffer.length === 0) {
      return [];
    }

    const eventsToFlush = buffer.splice(0, buffer.length);
    const results: DeliveryResult[] = [];

    for (const event of eventsToFlush) {
      const result = await retryWithBackoff(event, 0);
      results.push(result);
    }

    return results;
  };

  return {
    async forward(event: SecurityEvent): Promise<DeliveryResult> {
      if (isShutdown) {
        return {
          eventId: event.id,
          provider: config.provider,
          success: false,
          error: 'Forwarder has been shut down',
          timestamp: new Date().toISOString(),
        };
      }

      buffer.push(event);

      if (buffer.length >= config.batchSize) {
        const results = await flush();
        return results[results.length - 1];
      }

      scheduleFlush();

      return {
        eventId: event.id,
        provider: config.provider,
        success: true,
        timestamp: new Date().toISOString(),
      };
    },

    flush,

    async shutdown(): Promise<void> {
      isShutdown = true;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await flush();
    },
  };
}
