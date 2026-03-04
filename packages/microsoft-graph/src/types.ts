/**
 * @hmc/microsoft-graph - Type definitions
 */

export interface EmailSearchResult {
  id: string;
  subject: string;
  from: { name: string; email: string };
  receivedAt: Date;
  preview: string;
  webLink: string;
  hasAttachments: boolean;
}

export interface FileSearchResult {
  id: string;
  driveId: string;
  name: string;
  webUrl: string;
  lastModified: Date;
  modifiedBy: string;
  size: number;
  path: string;
  source: 'onedrive' | 'sharepoint';
}

export interface CalendarEvent {
  id: string;
  subject: string;
  start: Date;
  end: Date;
  location?: string;
  attendees: Array<{ name: string; email: string; status: string }>;
  organizer: { name: string; email: string };
  webLink: string;
}

export interface Person {
  id: string;
  displayName: string;
  emailAddresses: Array<{ address: string }>;
  userPrincipalName?: string;
}

export interface EmailDetail {
  id: string;
  subject: string;
  from: { name: string; email: string };
  to: Array<{ name: string; email: string }>;
  cc: Array<{ name: string; email: string }>;
  receivedAt: Date;
  body: string;
  bodyType: 'html' | 'text';
  webLink: string;
  hasAttachments: boolean;
  conversationId: string;
  importance: string;
}

export interface EmailAttachmentInfo {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
}

export interface EmailAttachmentContent {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes: string; // base64
}

export interface FileContent {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content: string;
  webUrl: string;
}

export interface SharePointSite {
  id: string;
  displayName: string;
  webUrl: string;
  description: string;
}

export interface DriveInfo {
  id: string;
  name: string;
  driveType: string;
  webUrl: string;
}

export interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  lastModified: Date;
  isFolder: boolean;
  mimeType?: string;
}

export interface UserProfile {
  department: string | null;
  jobTitle: string | null;
  officeLocation: string | null;
  manager: {
    id: string;
    displayName: string;
    email: string;
  } | null;
}

/**
 * Token storage adapter - implement this to persist Graph API tokens.
 * Keeps the package database-agnostic.
 */
export interface GraphTokenAdapter {
  getToken(userId: string): Promise<{
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    expiresAt: Date;
    scopes?: string[] | null;
  } | null>;
  storeToken(userId: string, token: {
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    expiresAt: Date;
    scopes: string[];
  }): Promise<void>;
  clearToken(userId: string): Promise<void>;
}

/**
 * Token refresh function - implement this to call MSAL or your OAuth provider.
 */
export interface TokenRefreshFn {
  (refreshToken: string, scopes?: string[]): Promise<{
    accessToken: string;
    expiresOn: Date;
    scopes: string[];
  } | null>;
}
