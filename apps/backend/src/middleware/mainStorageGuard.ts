import type { Context } from 'hono';
import { hasAnyApiKeyPermission } from './apiKeyPermissions';

export function canWriteMainStorage(c: Context, enforceV2Permissions = false): boolean {
  if (c.get('authType') === 'apikey') {
    if (!enforceV2Permissions) return true;
    return hasAnyApiKeyPermission(c, ['admin', 'main_storage']);
  }

  const role = c.get('serviceRole');
  return role === 'admin' || role === 'plus';
}

export function mainStorageForbiddenResponse(c: Context) {
  return c.json(
    {
      error: 'Forbidden',
      message: 'Main storage uploads require admin or plus role',
    },
    403
  );
}
