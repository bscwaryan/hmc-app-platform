/**
 * @hmc/scim - SCIM 2.0 user provisioning (F-021)
 *
 * Provides:
 * - SCIM 2.0 compliant user and group management
 * - Filter parsing for SCIM query syntax
 * - Request handler for SCIM HTTP endpoints
 * - Response formatting per SCIM spec
 * - User data validation
 *
 * Uses adapter pattern for database storage (database-agnostic).
 */

// ── Types ───────────────────────────────────────────────────────

export interface ScimUser {
  schemas: string[];
  id: string;
  externalId: string;
  userName: string;
  name: {
    givenName: string;
    familyName: string;
  };
  emails: Array<{
    value: string;
    type: string;
    primary: boolean;
  }>;
  active: boolean;
  groups?: Array<{
    value: string;
    display: string;
  }>;
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
    location: string;
  };
}

export interface ScimGroup {
  schemas: string[];
  id: string;
  displayName: string;
  members: Array<{
    value: string;
    display: string;
  }>;
  meta: {
    resourceType: string;
    created: string;
    lastModified: string;
    location: string;
  };
}

export interface ScimListResponse {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: unknown[];
}

export interface ScimError {
  schemas: string[];
  status: string;
  detail: string;
}

export interface ScimFilter {
  attribute: string;
  operator: 'eq' | 'co' | 'sw' | 'pr' | 'gt' | 'ge' | 'lt' | 'le';
  value?: string;
}

// ── Adapter ─────────────────────────────────────────────────────

export interface ScimDbAdapter {
  getUsers(filter?: ScimFilter[], startIndex?: number, count?: number): Promise<{ users: ScimUser[]; total: number }>;
  getUser(id: string): Promise<ScimUser | null>;
  createUser(user: Omit<ScimUser, 'id' | 'meta'>): Promise<ScimUser>;
  updateUser(id: string, user: Partial<ScimUser>): Promise<ScimUser>;
  deleteUser(id: string): Promise<void>;
  getGroups(filter?: ScimFilter[], startIndex?: number, count?: number): Promise<{ groups: ScimGroup[]; total: number }>;
  getGroup(id: string): Promise<ScimGroup | null>;
  createGroup(group: Omit<ScimGroup, 'id' | 'meta'>): Promise<ScimGroup>;
  updateGroup(id: string, group: Partial<ScimGroup>): Promise<ScimGroup>;
  deleteGroup(id: string): Promise<void>;
  mapScimUserToLocal(scimUser: ScimUser): Promise<Record<string, unknown>>;
  mapLocalUserToScim(localUser: Record<string, unknown>): Promise<ScimUser>;
}

// ── Constants ───────────────────────────────────────────────────

export const SCIM_SCHEMAS = {
  User: 'urn:ietf:params:scim:schemas:core:2.0:User',
  Group: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  ListResponse: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  Error: 'urn:ietf:params:scim:api:messages:2.0:Error',
} as const;

// ── Business Logic ──────────────────────────────────────────────

/**
 * Parse a SCIM filter string into structured filter objects.
 * Supports syntax like: userName eq "john"
 */
export function parseScimFilter(filterString: string): ScimFilter[] {
  const filters: ScimFilter[] = [];

  if (!filterString || filterString.trim().length === 0) {
    return filters;
  }

  // Split by ' and ' for compound filters
  const parts = filterString.split(/ and /i);

  for (const part of parts) {
    const trimmed = part.trim();

    // Handle 'pr' (present) operator: "attribute pr"
    const prMatch = trimmed.match(/^(\S+)\s+pr$/i);
    if (prMatch) {
      filters.push({
        attribute: prMatch[1],
        operator: 'pr',
      });
      continue;
    }

    // Handle other operators: "attribute op value"
    const match = trimmed.match(/^(\S+)\s+(eq|co|sw|gt|ge|lt|le)\s+"([^"]*)"$/i);
    if (match) {
      filters.push({
        attribute: match[1],
        operator: match[2].toLowerCase() as ScimFilter['operator'],
        value: match[3],
      });
      continue;
    }

    // Try without quotes for numeric values
    const numMatch = trimmed.match(/^(\S+)\s+(eq|co|sw|gt|ge|lt|le)\s+(\S+)$/i);
    if (numMatch) {
      filters.push({
        attribute: numMatch[1],
        operator: numMatch[2].toLowerCase() as ScimFilter['operator'],
        value: numMatch[3],
      });
    }
  }

  return filters;
}

/**
 * Create a SCIM list response.
 */
export function createScimResponse(
  resources: unknown[],
  total: number,
  startIndex: number,
): ScimListResponse {
  return {
    schemas: [SCIM_SCHEMAS.ListResponse],
    totalResults: total,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

/**
 * Validate a SCIM user object.
 */
export function validateScimUser(
  data: unknown,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data must be an object'] };
  }

  const user = data as Record<string, unknown>;

  if (!user.userName || typeof user.userName !== 'string') {
    errors.push('userName is required and must be a string');
  }

  if (user.name !== undefined) {
    if (typeof user.name !== 'object' || user.name === null) {
      errors.push('name must be an object with givenName and familyName');
    } else {
      const name = user.name as Record<string, unknown>;
      if (name.givenName !== undefined && typeof name.givenName !== 'string') {
        errors.push('name.givenName must be a string');
      }
      if (name.familyName !== undefined && typeof name.familyName !== 'string') {
        errors.push('name.familyName must be a string');
      }
    }
  }

  if (user.emails !== undefined) {
    if (!Array.isArray(user.emails)) {
      errors.push('emails must be an array');
    } else {
      for (let i = 0; i < user.emails.length; i++) {
        const email = user.emails[i] as Record<string, unknown>;
        if (!email.value || typeof email.value !== 'string') {
          errors.push(`emails[${i}].value is required and must be a string`);
        }
      }
    }
  }

  if (user.active !== undefined && typeof user.active !== 'boolean') {
    errors.push('active must be a boolean');
  }

  if (user.schemas !== undefined) {
    if (!Array.isArray(user.schemas)) {
      errors.push('schemas must be an array');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Handle a SCIM HTTP request and return the appropriate response.
 * Routes to the correct adapter method based on method and path.
 */
export async function handleScimRequest(
  adapter: ScimDbAdapter,
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const upperMethod = method.toUpperCase();
  const normalizedPath = path.replace(/\/+$/, '');

  try {
    // ── Users endpoints ──
    if (normalizedPath === '/Users' || normalizedPath === '/scim/v2/Users') {
      if (upperMethod === 'GET') {
        const filter = query?.filter ? parseScimFilter(query.filter) : undefined;
        const startIndex = query?.startIndex ? parseInt(query.startIndex, 10) : 1;
        const count = query?.count ? parseInt(query.count, 10) : 100;

        const { users, total } = await adapter.getUsers(filter, startIndex, count);
        return {
          status: 200,
          body: createScimResponse(users, total, startIndex),
        };
      }

      if (upperMethod === 'POST') {
        const validation = validateScimUser(body);
        if (!validation.valid) {
          return {
            status: 400,
            body: createScimError('400', validation.errors.join('; ')),
          };
        }

        const user = await adapter.createUser(body as Omit<ScimUser, 'id' | 'meta'>);
        return { status: 201, body: user };
      }
    }

    // ── Single User endpoints ──
    const userMatch = normalizedPath.match(/^(?:\/scim\/v2)?\/Users\/(.+)$/);
    if (userMatch) {
      const userId = userMatch[1];

      if (upperMethod === 'GET') {
        const user = await adapter.getUser(userId);
        if (!user) {
          return {
            status: 404,
            body: createScimError('404', `User ${userId} not found`),
          };
        }
        return { status: 200, body: user };
      }

      if (upperMethod === 'PUT') {
        const validation = validateScimUser(body);
        if (!validation.valid) {
          return {
            status: 400,
            body: createScimError('400', validation.errors.join('; ')),
          };
        }

        const user = await adapter.updateUser(userId, body as Partial<ScimUser>);
        return { status: 200, body: user };
      }

      if (upperMethod === 'PATCH') {
        const user = await adapter.updateUser(userId, body as Partial<ScimUser>);
        return { status: 200, body: user };
      }

      if (upperMethod === 'DELETE') {
        await adapter.deleteUser(userId);
        return { status: 204, body: null };
      }
    }

    // ── Groups endpoints ──
    if (normalizedPath === '/Groups' || normalizedPath === '/scim/v2/Groups') {
      if (upperMethod === 'GET') {
        const filter = query?.filter ? parseScimFilter(query.filter) : undefined;
        const startIndex = query?.startIndex ? parseInt(query.startIndex, 10) : 1;
        const count = query?.count ? parseInt(query.count, 10) : 100;

        const { groups, total } = await adapter.getGroups(filter, startIndex, count);
        return {
          status: 200,
          body: createScimResponse(groups, total, startIndex),
        };
      }

      if (upperMethod === 'POST') {
        const group = await adapter.createGroup(body as Omit<ScimGroup, 'id' | 'meta'>);
        return { status: 201, body: group };
      }
    }

    // ── Single Group endpoints ──
    const groupMatch = normalizedPath.match(/^(?:\/scim\/v2)?\/Groups\/(.+)$/);
    if (groupMatch) {
      const groupId = groupMatch[1];

      if (upperMethod === 'GET') {
        const group = await adapter.getGroup(groupId);
        if (!group) {
          return {
            status: 404,
            body: createScimError('404', `Group ${groupId} not found`),
          };
        }
        return { status: 200, body: group };
      }

      if (upperMethod === 'PUT') {
        const group = await adapter.updateGroup(groupId, body as Partial<ScimGroup>);
        return { status: 200, body: group };
      }

      if (upperMethod === 'PATCH') {
        const group = await adapter.updateGroup(groupId, body as Partial<ScimGroup>);
        return { status: 200, body: group };
      }

      if (upperMethod === 'DELETE') {
        await adapter.deleteGroup(groupId);
        return { status: 204, body: null };
      }
    }

    return {
      status: 404,
      body: createScimError('404', `Endpoint not found: ${method} ${path}`),
    };
  } catch (error) {
    return {
      status: 500,
      body: createScimError(
        '500',
        error instanceof Error ? error.message : 'Internal server error',
      ),
    };
  }
}

function createScimError(status: string, detail: string): ScimError {
  return {
    schemas: [SCIM_SCHEMAS.Error],
    status,
    detail,
  };
}
