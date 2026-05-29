import type { Context } from 'hono';
import { hasAnyApiKeyPermission } from './apiKeyPermissions';
import { V2Error } from '../lib/v2/errors';

export function canWriteMainStorage(c: Context): boolean {
  if (c.get('authType') === 'apikey') {
    return hasAnyApiKeyPermission(c, ['admin', 'main_storage']);
  }

  const role = c.get('serviceRole');
  return role === 'admin' || role === 'plus';
}

export function mainStorageForbiddenResponse(_c: Context) {
  throw new V2Error('forbidden', 403, 'Main storage uploads require admin or plus role');
}
