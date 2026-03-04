/**
 * @hmc/queue - BullMQ-based background job processing
 *
 * Provides:
 * - Named queue creation and management
 * - Worker registration with configurable concurrency
 * - Graceful fallback to direct execution when Redis is unavailable
 * - Queue statistics
 * - Graceful shutdown
 *
 * Pre-defined queue names for common operations, plus custom queue support.
 */

import { Queue, Worker, Job } from 'bullmq';
import { createLogger } from '@hmc/logger';

const logger = createLogger('queue');

// ── Configuration ───────────────────────────────────────────────

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: null;
}

// ── Pre-defined Queue Names ─────────────────────────────────────

export const QUEUE_NAMES = {
  DOCUMENT_PROCESSING: 'document-processing',
  COUNCIL_SESSION: 'council-session',
  EMAIL_DELIVERY: 'email-delivery',
  BATCH_EXPORT: 'batch-export',
  CACHE_WARMING: 'cache-warming',
  NOTIFICATION: 'notification',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES] | string;

// ── Re-export Job type for handler signatures ───────────────────

export type { Job } from 'bullmq';

// ── Service ─────────────────────────────────────────────────────

class JobQueueService {
  private queues = new Map<string, Queue>();
  private workers = new Map<string, Worker>();
  private handlers = new Map<string, (job: Job) => Promise<unknown>>();
  private redisConfig: RedisConfig | null = null;
  private initialized = false;

  /**
   * Initialize the job queue system.
   * Returns false if Redis is unavailable (fallback mode).
   */
  async initialize(options?: {
    redisHost?: string;
    redisPort?: number;
    redisPassword?: string;
    queueNames?: string[];
  }): Promise<boolean> {
    if (this.initialized) return true;

    const host = options?.redisHost || process.env.REDIS_HOST;
    if (!host) {
      logger.info('Redis not configured — running in direct-execution fallback mode');
      this.initialized = true;
      return false;
    }

    this.redisConfig = {
      host,
      port: options?.redisPort || parseInt(process.env.REDIS_PORT || '6379', 10),
      password: options?.redisPassword || process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    };

    try {
      const names = options?.queueNames || Object.values(QUEUE_NAMES);
      for (const name of names) {
        const queue = new Queue(name, {
          connection: this.redisConfig,
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { age: 24 * 60 * 60 },
            removeOnFail: { age: 7 * 24 * 60 * 60 },
          },
        });
        this.queues.set(name, queue);
      }

      this.initialized = true;
      logger.info('Job queue initialized with Redis', {
        host: this.redisConfig.host,
        queues: names,
      });
      return true;
    } catch (error) {
      logger.warn('Failed to connect to Redis — falling back to direct execution', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      this.redisConfig = null;
      this.initialized = true;
      return false;
    }
  }

  /**
   * Register a handler for a queue.
   * If Redis is available, starts a Worker for that queue.
   */
  registerHandler(
    queueName: QueueName,
    handler: (job: Job) => Promise<unknown>,
    options?: { concurrency?: number },
  ): void {
    this.handlers.set(queueName, handler);

    if (this.redisConfig && !this.workers.has(queueName)) {
      const worker = new Worker(queueName, handler, {
        connection: this.redisConfig,
        concurrency: options?.concurrency ?? 5,
      });

      worker.on('completed', (job: Job) => {
        logger.debug(`Job completed: ${queueName}/${job.id}`);
      });

      worker.on('failed', (job: Job | undefined, err: Error) => {
        logger.error(`Job failed: ${queueName}/${job?.id}`, {
          error: err.message,
          attempts: job?.attemptsMade,
        });
      });

      this.workers.set(queueName, worker);
      logger.info(`Worker started for queue: ${queueName}`);
    }
  }

  /**
   * Add a job to a queue.
   * Falls back to direct handler execution if Redis is unavailable.
   */
  async addJob<T extends Record<string, unknown>>(
    queueName: QueueName,
    data: T,
    options?: { priority?: number; delay?: number; jobId?: string },
  ): Promise<{ id: string; queued: boolean }> {
    await this.initialize();

    const queue = this.queues.get(queueName);

    if (queue && this.redisConfig) {
      const job = await queue.add(queueName, data, {
        priority: options?.priority,
        delay: options?.delay,
        jobId: options?.jobId,
      });
      logger.debug(`Job queued: ${queueName}/${job.id}`);
      return { id: job.id || 'unknown', queued: true };
    }

    // Fallback: direct execution
    const handler = this.handlers.get(queueName);
    if (handler) {
      const jobId = `direct-${Date.now()}`;
      const fakeJob = { id: jobId, data, name: queueName } as unknown as Job;
      try {
        await handler(fakeJob);
        logger.debug(`Job executed directly: ${queueName}`);
        return { id: jobId, queued: false };
      } catch (error) {
        logger.error(`Direct execution failed: ${queueName}`, {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        throw error;
      }
    }

    logger.warn(`No handler for queue: ${queueName} — job dropped`);
    return { id: 'dropped', queued: false };
  }

  /**
   * Get statistics for all queues.
   */
  async getQueueStats(): Promise<Record<string, {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }>> {
    const stats: Record<string, {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    }> = {};

    for (const [name, queue] of this.queues) {
      try {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        stats[name] = {
          waiting: counts.waiting || 0,
          active: counts.active || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          delayed: counts.delayed || 0,
        };
      } catch {
        stats[name] = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      }
    }

    return stats;
  }

  /** Check if running in Redis mode or fallback mode. */
  isRedisMode(): boolean {
    return this.redisConfig !== null;
  }

  /** Graceful shutdown of all workers and queues. */
  async shutdown(): Promise<void> {
    logger.info('Shutting down job queue...');

    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.debug(`Worker closed: ${name}`);
    }
    this.workers.clear();

    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.debug(`Queue closed: ${name}`);
    }
    this.queues.clear();

    this.initialized = false;
    logger.info('Job queue shut down');
  }
}

export const jobQueue = new JobQueueService();
