/**
 * Graph Connector - Read-only Microsoft Graph API client
 *
 * Provides search and read access to:
 * - Email (search, read, recent, attachments)
 * - Files (OneDrive + SharePoint search, content reading)
 * - Calendar (events, search)
 * - Teams (message search)
 * - People (resolve by name)
 * - User Profile (Entra ID attributes)
 * - SharePoint (sites, drives, browsing)
 *
 * READ-ONLY SAFEGUARD: All HTTP requests are intercepted.
 * Only GET and specific POST (search) requests are allowed.
 */

import { Client } from '@microsoft/microsoft-graph-client';
import { createLogger } from '@hmc/logger';
import { getValidToken } from './tokenManager.js';
import type {
  EmailSearchResult,
  FileSearchResult,
  CalendarEvent,
  Person,
  EmailDetail,
  EmailAttachmentInfo,
  EmailAttachmentContent,
  FileContent,
  SharePointSite,
  DriveInfo,
  DriveItem,
  UserProfile,
} from './types.js';

const logger = createLogger('graph-connector');

// ── Read-Only Safeguard ─────────────────────────────────────────

const ALLOWED_POST_PATHS = [
  '/search/query', // Microsoft Search API (read-only search)
];

function readOnlyFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();

  if (method === 'GET') {
    return fetch(url, init);
  }

  if (method === 'POST') {
    const isAllowedPost = ALLOWED_POST_PATHS.some(path => url.includes(path));
    if (isAllowedPost) {
      return fetch(url, init);
    }
  }

  const errorMsg = `[M365_WRITE_BLOCKED] Read-only safeguard blocked ${method} request to ${url}. ` +
    `Write/edit/delete operations are DISABLED for security.`;
  logger.error(errorMsg, { method, url });
  return Promise.reject(new Error(errorMsg));
}

// ── Client Creation ─────────────────────────────────────────────

async function getClient(userId: string): Promise<Client> {
  const token = await getValidToken(userId);

  const options: Record<string, unknown> = {
    authProvider: (done: (error: unknown, token: string | null) => void) => {
      done(null, token);
    },
    customFetch: readOnlyFetch,
  };

  return Client.init(options as unknown as Parameters<typeof Client.init>[0]);
}

// ── Email ───────────────────────────────────────────────────────

function buildEmailSearchQuery(
  query: string,
  options: { after?: Date; before?: Date },
): string {
  const parts: string[] = [];

  const fromMatch = query.match(/from[:\s]+["']?([^"'\s]+)["']?/i);
  if (fromMatch) {
    parts.push(`from:${fromMatch[1]}`);
  }

  const subjectMatch = query.match(/subject[:\s]+["'](.+?)["']/i);
  if (subjectMatch) {
    parts.push(`subject:"${subjectMatch[1]}"`);
  }

  const remainingQuery = query
    .replace(/from[:\s]+["']?[^"'\s]+["']?/gi, '')
    .replace(/subject[:\s]+["'].+?["']/gi, '')
    .trim();

  if (remainingQuery) {
    parts.push(`"${remainingQuery}"`);
  }

  return parts.join(' AND ') || '*';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEmail(email: any): EmailSearchResult {
  return {
    id: email.id,
    subject: email.subject,
    from: {
      name: email.from?.emailAddress?.name || '',
      email: email.from?.emailAddress?.address || '',
    },
    receivedAt: new Date(email.receivedDateTime),
    preview: email.bodyPreview || '',
    webLink: email.webLink,
    hasAttachments: email.hasAttachments,
  };
}

export async function searchEmails(
  userId: string,
  query: string,
  options: { limit?: number; after?: Date; before?: Date } = {},
): Promise<EmailSearchResult[]> {
  logger.info('Searching emails', { userId, query: query.substring(0, 100) });
  const client = await getClient(userId);
  const searchQuery = buildEmailSearchQuery(query, options);

  const response = await client
    .api('/me/messages')
    .search(searchQuery)
    .select('id,subject,from,receivedDateTime,bodyPreview,webLink,hasAttachments')
    .top(options.limit || 10)
    .orderby('receivedDateTime DESC')
    .get();

  return response.value.map(mapEmail);
}

export async function getRecentEmails(
  userId: string,
  options: { folder?: string; limit?: number } = {},
): Promise<EmailSearchResult[]> {
  const client = await getClient(userId);
  const folder = options.folder || 'inbox';

  const response = await client
    .api(`/me/mailFolders/${folder}/messages`)
    .select('id,subject,from,receivedDateTime,bodyPreview,webLink,hasAttachments')
    .orderby('receivedDateTime DESC')
    .top(options.limit || 10)
    .get();

  return response.value.map(mapEmail);
}

export async function getEmailById(userId: string, emailId: string): Promise<EmailDetail> {
  const client = await getClient(userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const email: any = await client
    .api(`/me/messages/${emailId}`)
    .select('id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,webLink,hasAttachments,conversationId,importance')
    .get();

  return {
    id: email.id,
    subject: email.subject,
    from: {
      name: email.from?.emailAddress?.name || '',
      email: email.from?.emailAddress?.address || '',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    to: (email.toRecipients || []).map((r: any) => ({
      name: r.emailAddress?.name || '',
      email: r.emailAddress?.address || '',
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cc: (email.ccRecipients || []).map((r: any) => ({
      name: r.emailAddress?.name || '',
      email: r.emailAddress?.address || '',
    })),
    receivedAt: new Date(email.receivedDateTime),
    body: email.body?.content || '',
    bodyType: email.body?.contentType === 'html' ? 'html' : 'text',
    webLink: email.webLink,
    hasAttachments: email.hasAttachments,
    conversationId: email.conversationId || '',
    importance: email.importance || 'normal',
  };
}

export async function listEmailAttachments(
  userId: string,
  emailId: string,
): Promise<EmailAttachmentInfo[]> {
  const client = await getClient(userId);

  const response = await client
    .api(`/me/messages/${emailId}/attachments`)
    .select('id,name,contentType,size,isInline')
    .get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response.value || []).map((att: any) => ({
    id: att.id,
    name: att.name,
    contentType: att.contentType,
    size: att.size,
    isInline: att.isInline,
  }));
}

export async function getEmailAttachmentContent(
  userId: string,
  emailId: string,
  attachmentId: string,
): Promise<EmailAttachmentContent | null> {
  const client = await getClient(userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const att: any = await client
    .api(`/me/messages/${emailId}/attachments/${attachmentId}`)
    .get();

  if (!att.contentBytes) return null;

  return {
    id: att.id,
    name: att.name,
    contentType: att.contentType,
    size: att.size,
    contentBytes: att.contentBytes,
  };
}

// ── Files ───────────────────────────────────────────────────────

export async function searchFiles(
  userId: string,
  query: string,
  options: { limit?: number } = {},
): Promise<FileSearchResult[]> {
  logger.info('Searching files', { userId, query: query.substring(0, 100) });
  const client = await getClient(userId);

  const response = await client
    .api('/search/query')
    .post({
      requests: [{
        entityTypes: ['driveItem'],
        query: { queryString: query },
        from: 0,
        size: options.limit || 25,
      }],
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hits = response.value?.[0]?.hitsContainers?.[0]?.hits || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return hits.map((hit: any) => {
    const resource = hit.resource;
    return {
      id: resource.id,
      driveId: resource.parentReference?.driveId || '',
      name: resource.name,
      webUrl: resource.webUrl,
      lastModified: new Date(resource.lastModifiedDateTime),
      modifiedBy: resource.lastModifiedBy?.user?.displayName || '',
      size: resource.size || 0,
      path: resource.parentReference?.path || '',
      source: resource.parentReference?.driveType === 'documentLibrary'
        ? 'sharepoint' as const
        : 'onedrive' as const,
    };
  });
}

export async function getRecentFiles(
  userId: string,
  options: { limit?: number } = {},
): Promise<FileSearchResult[]> {
  const client = await getClient(userId);

  const response = await client
    .api('/me/drive/recent')
    .top(options.limit || 10)
    .get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response.value || []).map((item: any) => ({
    id: item.id,
    driveId: item.parentReference?.driveId || '',
    name: item.name,
    webUrl: item.webUrl,
    lastModified: new Date(item.lastModifiedDateTime),
    modifiedBy: item.lastModifiedBy?.user?.displayName || '',
    size: item.size || 0,
    path: item.parentReference?.path || '',
    source: item.parentReference?.driveType === 'documentLibrary'
      ? 'sharepoint' as const
      : 'onedrive' as const,
  }));
}

export async function getFileContent(
  userId: string,
  driveId: string,
  itemId: string,
): Promise<FileContent | null> {
  const client = await getClient(userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metadata: any = await client
    .api(`/drives/${driveId}/items/${itemId}`)
    .select('id,name,file,size,webUrl')
    .get();

  const mimeType = metadata.file?.mimeType || 'application/octet-stream';
  const name = metadata.name || '';

  const textTypes = [
    'text/', 'application/json', 'application/xml', 'application/csv',
    'application/javascript', 'application/typescript',
  ];
  const textExtensions = ['.txt', '.csv', '.md', '.json', '.xml', '.html', '.htm', '.yaml', '.yml', '.log', '.js', '.ts', '.py', '.sql'];
  const isTextFile = textTypes.some(t => mimeType.startsWith(t)) ||
    textExtensions.some(ext => name.toLowerCase().endsWith(ext));

  if (!isTextFile && metadata.size > 100 * 1024) {
    return {
      id: metadata.id,
      name,
      mimeType,
      size: metadata.size,
      content: `[Binary file: ${name} (${mimeType}, ${Math.round(metadata.size / 1024)}KB). Open in browser to view.]`,
      webUrl: metadata.webUrl,
    };
  }

  try {
    const response = await client
      .api(`/drives/${driveId}/items/${itemId}/content`)
      .getStream();

    const chunks: Buffer[] = [];
    let totalSize = 0;
    const MAX_SIZE = 50 * 1024;

    for await (const chunk of response as AsyncIterable<Buffer>) {
      totalSize += chunk.length;
      if (totalSize > MAX_SIZE) {
        chunks.push(chunk.subarray(0, MAX_SIZE - (totalSize - chunk.length)));
        break;
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    const content = buffer.toString('utf-8');
    const truncated = totalSize > MAX_SIZE;

    return {
      id: metadata.id,
      name,
      mimeType,
      size: metadata.size,
      content: truncated
        ? `${content}\n\n[Content truncated at 50KB. Full file is ${Math.round(metadata.size / 1024)}KB.]`
        : content,
      webUrl: metadata.webUrl,
    };
  } catch {
    return {
      id: metadata.id,
      name,
      mimeType,
      size: metadata.size,
      content: `[Could not read file content: ${name} (${mimeType}). Open in browser: ${metadata.webUrl}]`,
      webUrl: metadata.webUrl,
    };
  }
}

export async function getFileMetadata(
  userId: string,
  driveId: string,
  itemId: string,
): Promise<FileSearchResult> {
  const client = await getClient(userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item: any = await client
    .api(`/drives/${driveId}/items/${itemId}`)
    .select('id,name,webUrl,lastModifiedDateTime,lastModifiedBy,size,parentReference,file')
    .get();

  return {
    id: item.id,
    driveId: item.parentReference?.driveId || driveId,
    name: item.name,
    webUrl: item.webUrl,
    lastModified: new Date(item.lastModifiedDateTime),
    modifiedBy: item.lastModifiedBy?.user?.displayName || '',
    size: item.size || 0,
    path: item.parentReference?.path || '',
    source: item.parentReference?.driveType === 'documentLibrary'
      ? 'sharepoint'
      : 'onedrive',
  };
}

// ── Calendar ────────────────────────────────────────────────────

export async function getCalendarEvents(
  userId: string,
  options: { start?: Date; end?: Date; limit?: number } = {},
): Promise<CalendarEvent[]> {
  const client = await getClient(userId);
  const startDate = options.start || new Date();
  const endDate = options.end || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const response = await client
    .api('/me/calendarView')
    .query({
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
    })
    .select('id,subject,start,end,location,attendees,webLink,organizer')
    .orderby('start/dateTime')
    .top(options.limit || 50)
    .get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return response.value.map((event: any) => ({
    id: event.id,
    subject: event.subject,
    start: new Date(event.start.dateTime + 'Z'),
    end: new Date(event.end.dateTime + 'Z'),
    location: event.location?.displayName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attendees: (event.attendees || []).map((a: any) => ({
      name: a.emailAddress?.name || '',
      email: a.emailAddress?.address || '',
      status: a.status?.response || 'none',
    })),
    organizer: {
      name: event.organizer?.emailAddress?.name || '',
      email: event.organizer?.emailAddress?.address || '',
    },
    webLink: event.webLink,
  }));
}

export async function searchCalendarEvents(
  userId: string,
  options: { query?: string; attendee?: string; start?: Date; end?: Date; limit?: number } = {},
): Promise<CalendarEvent[]> {
  const client = await getClient(userId);
  const startDate = options.start || new Date();
  const endDate = options.end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  let request = client
    .api('/me/calendarView')
    .query({
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
    })
    .select('id,subject,start,end,location,attendees,webLink,organizer,bodyPreview')
    .orderby('start/dateTime')
    .top(options.limit || 25);

  if (options.query) {
    request = request.filter(`contains(subject,'${options.query.replace(/'/g, "''")}')`);
  }

  const response = await request.get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let events: CalendarEvent[] = response.value.map((event: any) => ({
    id: event.id,
    subject: event.subject,
    start: new Date(event.start.dateTime + 'Z'),
    end: new Date(event.end.dateTime + 'Z'),
    location: event.location?.displayName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attendees: (event.attendees || []).map((a: any) => ({
      name: a.emailAddress?.name || '',
      email: a.emailAddress?.address || '',
      status: a.status?.response || 'none',
    })),
    organizer: {
      name: event.organizer?.emailAddress?.name || '',
      email: event.organizer?.emailAddress?.address || '',
    },
    webLink: event.webLink,
  }));

  if (options.attendee) {
    const searchTerm = options.attendee.toLowerCase();
    events = events.filter(e =>
      e.attendees.some(a =>
        a.name.toLowerCase().includes(searchTerm) ||
        a.email.toLowerCase().includes(searchTerm),
      ) ||
      e.organizer.name.toLowerCase().includes(searchTerm) ||
      e.organizer.email.toLowerCase().includes(searchTerm),
    );
  }

  return events;
}

// ── Teams ───────────────────────────────────────────────────────

export async function searchTeamsMessages(
  userId: string,
  query: string,
  options: { limit?: number } = {},
): Promise<Array<{
  id: string;
  chatId: string;
  content: string;
  from: { name: string; email: string };
  createdAt: Date;
}>> {
  const client = await getClient(userId);

  try {
    const response = await client
      .api('/search/query')
      .post({
        requests: [{
          entityTypes: ['chatMessage'],
          query: { queryString: query },
          from: 0,
          size: options.limit || 25,
        }],
      });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hits = response.value?.[0]?.hitsContainers?.[0]?.hits || [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return hits.map((hit: any) => {
      const resource = hit.resource;
      return {
        id: resource.id,
        chatId: resource.chatId || '',
        content: resource.body?.content || '',
        from: {
          name: resource.from?.user?.displayName || '',
          email: resource.from?.user?.email || '',
        },
        createdAt: new Date(resource.createdDateTime),
      };
    });
  } catch (error: unknown) {
    const err = error as Error;
    logger.warn('Teams search failed', { error: err.message });
    return [];
  }
}

// ── People ──────────────────────────────────────────────────────

export async function resolvePerson(userId: string, name: string): Promise<Person[]> {
  const client = await getClient(userId);

  const response = await client
    .api('/me/people')
    .search(name)
    .select('id,displayName,emailAddresses,userPrincipalName')
    .top(5)
    .get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return response.value.map((person: any) => ({
    id: person.id,
    displayName: person.displayName,
    emailAddresses: person.emailAddresses || [],
    userPrincipalName: person.userPrincipalName,
  }));
}

// ── User Profile ────────────────────────────────────────────────

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const client = await getClient(userId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile: any = await client
    .api('/me')
    .select('department,jobTitle,officeLocation')
    .get();

  let manager: UserProfile['manager'] = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const managerData: any = await client
      .api('/me/manager')
      .select('id,displayName,mail,userPrincipalName')
      .get();

    manager = {
      id: managerData.id,
      displayName: managerData.displayName || '',
      email: managerData.mail || managerData.userPrincipalName || '',
    };
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    if (err.statusCode !== 404) {
      logger.warn('Failed to fetch manager', { userId, error: (err as unknown as Error).message });
    }
  }

  return {
    department: profile.department || null,
    jobTitle: profile.jobTitle || null,
    officeLocation: profile.officeLocation || null,
    manager,
  };
}

// ── SharePoint ──────────────────────────────────────────────────

export async function listFollowedSites(userId: string): Promise<SharePointSite[]> {
  const client = await getClient(userId);

  try {
    const response = await client
      .api('/me/followedSites')
      .select('id,displayName,webUrl,description')
      .get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (response.value || []).map((site: any) => ({
      id: site.id,
      displayName: site.displayName || '',
      webUrl: site.webUrl || '',
      description: site.description || '',
    }));
  } catch {
    return [];
  }
}

export async function listSiteDrives(userId: string, siteId: string): Promise<DriveInfo[]> {
  const client = await getClient(userId);

  const response = await client
    .api(`/sites/${siteId}/drives`)
    .select('id,name,driveType,webUrl')
    .get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response.value || []).map((drive: any) => ({
    id: drive.id,
    name: drive.name || '',
    driveType: drive.driveType || '',
    webUrl: drive.webUrl || '',
  }));
}

export async function listDriveItems(
  userId: string,
  driveId: string,
  folderId?: string,
): Promise<DriveItem[]> {
  const client = await getClient(userId);

  const path = folderId
    ? `/drives/${driveId}/items/${folderId}/children`
    : `/drives/${driveId}/root/children`;

  const response = await client
    .api(path)
    .select('id,name,webUrl,size,lastModifiedDateTime,folder,file')
    .top(100)
    .get();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response.value || []).map((item: any) => ({
    id: item.id,
    name: item.name,
    webUrl: item.webUrl,
    size: item.size || 0,
    lastModified: new Date(item.lastModifiedDateTime),
    isFolder: !!item.folder,
    mimeType: item.file?.mimeType,
  }));
}
