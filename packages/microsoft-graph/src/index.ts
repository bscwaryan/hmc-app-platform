/**
 * @hmc/microsoft-graph - Microsoft Graph API integration
 *
 * Provides read-only access to Microsoft 365 services:
 * - Email (search, read, attachments)
 * - Files (OneDrive + SharePoint)
 * - Calendar (events, search)
 * - Teams (message search)
 * - People (resolve by name)
 * - User Profile (Entra ID)
 * - SharePoint (sites, drives, browsing)
 *
 * Uses adapter pattern for token storage (database-agnostic).
 */

export type {
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
  GraphTokenAdapter,
  TokenRefreshFn,
} from './types.js';

export {
  AuthenticationError,
  initTokenManager,
  getValidToken,
  storeTokens,
  clearTokens,
} from './tokenManager.js';

export {
  searchEmails,
  getRecentEmails,
  getEmailById,
  listEmailAttachments,
  getEmailAttachmentContent,
  searchFiles,
  getRecentFiles,
  getFileContent,
  getFileMetadata,
  getCalendarEvents,
  searchCalendarEvents,
  searchTeamsMessages,
  resolvePerson,
  getUserProfile,
  listFollowedSites,
  listSiteDrives,
  listDriveItems,
} from './graphConnector.js';
