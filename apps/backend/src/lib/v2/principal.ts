import type { Context } from 'hono';
import type { Permission } from '../../db/v1/apiKeys';
import { requireApiKeyPermission } from '../../middleware/apiKeyPermissions';
import { V2Error } from './errors';

export function getV2StorageUserId(c: Context, requiredPermission: Permission): string {
  if (c.get('authType') !== 'apikey') {
    return c.get('userId');
  }

  // Admin API keys can operate without X-Target-User-ID
  if (c.get('apiKeyPermissions')?.includes('admin')) {
    return c.get('userId');
  }

  // Non-admin API keys must specify target user and have the required permission
  requireApiKeyPermission(c, requiredPermission);

  const targetUserId = c.req.header('X-Target-User-ID')?.trim();
  if (!targetUserId) {
    throw new V2Error('validation_error', 400, 'X-Target-User-ID header is required for API-key access to user storage');
  }

  return targetUserId;
}
