/**
 * @hmc/conversations - Chat conversation persistence (F-019)
 *
 * Provides:
 * - Conversation CRUD with pinning, archiving, sharing
 * - Message persistence with model/token/cost metadata
 * - Share tokens for public conversation access
 * - ChatGPT and Claude export format parsing
 * - Automatic title generation from first user message
 *
 * Uses adapter pattern for database storage (database-agnostic).
 */

import { randomBytes, randomUUID } from 'node:crypto';

// ── Types ───────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  pinned: boolean;
  archived: boolean;
  shared: boolean;
  shareToken?: string;
  model?: string;
  systemPrompt?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  tokens?: number;
  cost?: number;
  createdAt: Date;
}

export interface ConversationImport {
  id: string;
  userId: string;
  source: 'chatgpt' | 'claude' | 'custom';
  status: string;
  importedCount: number;
  failedCount: number;
  createdAt: Date;
}

export interface ShareConfig {
  conversationId: string;
  token: string;
  expiresAt?: Date;
  passwordHash?: string;
}

// ── Adapter ─────────────────────────────────────────────────────

export interface ConversationDbAdapter {
  getConversations(userId: string, filters?: {
    pinned?: boolean;
    archived?: boolean;
    shared?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(conv: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Conversation>;
  updateConversation(id: string, updates: Partial<Conversation>): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  getMessages(conversationId: string, limit?: number, offset?: number): Promise<Message[]>;
  addMessage(message: Omit<Message, 'id' | 'createdAt'>): Promise<Message>;
  getSharedConversation(token: string): Promise<Conversation | null>;
  createShare(config: ShareConfig): Promise<ShareConfig>;
  revokeShare(conversationId: string): Promise<void>;
  importConversations(userId: string, data: Array<{ title: string; messages: Array<{ role: string; content: string }> }>, source: string): Promise<ConversationImport>;
}

// ── Business Logic ──────────────────────────────────────────────

/**
 * Create a new conversation for a user.
 */
export async function createConversation(
  adapter: ConversationDbAdapter,
  userId: string,
  opts?: { title?: string; model?: string; systemPrompt?: string },
): Promise<Conversation> {
  return adapter.createConversation({
    userId,
    title: opts?.title ?? 'New Conversation',
    pinned: false,
    archived: false,
    shared: false,
    model: opts?.model,
    systemPrompt: opts?.systemPrompt,
  });
}

/**
 * Add a message to a conversation.
 */
export async function addMessage(
  adapter: ConversationDbAdapter,
  conversationId: string,
  role: string,
  content: string,
  meta?: { model?: string; tokens?: number; cost?: number },
): Promise<Message> {
  const message = await adapter.addMessage({
    conversationId,
    role: role as Message['role'],
    content,
    model: meta?.model,
    tokens: meta?.tokens,
    cost: meta?.cost,
  });

  // Auto-generate title from first user message
  const conversation = await adapter.getConversation(conversationId);
  if (conversation && conversation.title === 'New Conversation' && role === 'user') {
    const title = generateTitle([{ role, content }]);
    await adapter.updateConversation(conversationId, { title });
  }

  return message;
}

/**
 * Generate a cryptographically secure share token.
 */
export function generateShareToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Share a conversation with an optional expiry and password.
 */
export async function shareConversation(
  adapter: ConversationDbAdapter,
  conversationId: string,
  opts?: { expiresIn?: number; password?: string },
): Promise<ShareConfig> {
  const token = generateShareToken();

  let expiresAt: Date | undefined;
  if (opts?.expiresIn) {
    expiresAt = new Date(Date.now() + opts.expiresIn * 1000);
  }

  let passwordHash: string | undefined;
  if (opts?.password) {
    // Simple hash for share password - not for user auth
    const { createHash } = await import('node:crypto');
    passwordHash = createHash('sha256').update(opts.password).digest('hex');
  }

  const shareConfig: ShareConfig = {
    conversationId,
    token,
    expiresAt,
    passwordHash,
  };

  const result = await adapter.createShare(shareConfig);

  await adapter.updateConversation(conversationId, {
    shared: true,
    shareToken: token,
  });

  return result;
}

/**
 * Parse a ChatGPT JSON export into a normalized format.
 */
export function parseChatGPTExport(
  data: unknown,
): { conversations: Array<{ title: string; messages: Array<{ role: string; content: string }> }> } {
  const conversations: Array<{ title: string; messages: Array<{ role: string; content: string }> }> = [];

  if (!Array.isArray(data)) {
    return { conversations };
  }

  for (const item of data) {
    if (!item || typeof item !== 'object') continue;

    const conv = item as Record<string, unknown>;
    const title = typeof conv.title === 'string' ? conv.title : 'Untitled';
    const messages: Array<{ role: string; content: string }> = [];

    const mapping = conv.mapping as Record<string, unknown> | undefined;
    if (mapping && typeof mapping === 'object') {
      for (const node of Object.values(mapping)) {
        const nodeObj = node as Record<string, unknown>;
        const message = nodeObj?.message as Record<string, unknown> | undefined;
        if (!message) continue;

        const author = message.author as Record<string, unknown> | undefined;
        const role = author?.role as string | undefined;
        const content = message.content as Record<string, unknown> | undefined;
        const parts = content?.parts as unknown[] | undefined;

        if (role && parts && parts.length > 0) {
          const textContent = parts
            .filter((p): p is string => typeof p === 'string')
            .join('\n');
          if (textContent) {
            messages.push({ role, content: textContent });
          }
        }
      }
    }

    conversations.push({ title, messages });
  }

  return { conversations };
}

/**
 * Parse a Claude export into a normalized format.
 */
export function parseClaudeExport(
  data: unknown,
): { conversations: Array<{ title: string; messages: Array<{ role: string; content: string }> }> } {
  const conversations: Array<{ title: string; messages: Array<{ role: string; content: string }> }> = [];

  if (!Array.isArray(data)) {
    return { conversations };
  }

  for (const item of data) {
    if (!item || typeof item !== 'object') continue;

    const conv = item as Record<string, unknown>;
    const title = typeof conv.name === 'string'
      ? conv.name
      : typeof conv.title === 'string'
        ? conv.title
        : 'Untitled';

    const messages: Array<{ role: string; content: string }> = [];

    const chatMessages = conv.chat_messages as unknown[] | undefined;
    if (Array.isArray(chatMessages)) {
      for (const msg of chatMessages) {
        const msgObj = msg as Record<string, unknown>;
        const sender = msgObj.sender as string | undefined;
        const text = msgObj.text as string | undefined;

        if (sender && text) {
          const role = sender === 'human' ? 'user' : sender === 'assistant' ? 'assistant' : sender;
          messages.push({ role, content: text });
        }
      }
    }

    conversations.push({ title, messages });
  }

  return { conversations };
}

/**
 * Generate a conversation title from the first user message.
 * Truncates to 50 characters.
 */
export function generateTitle(
  messages: Array<{ role: string; content: string }>,
): string {
  const firstUserMessage = messages.find((m) => m.role === 'user');
  if (!firstUserMessage) {
    return 'New Conversation';
  }

  const content = firstUserMessage.content.trim();
  if (content.length <= 50) {
    return content;
  }

  return content.substring(0, 47) + '...';
}
