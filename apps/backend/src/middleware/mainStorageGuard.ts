import type { Context } from 'hono';

/**
 * Returns true when the current request principal is allowed to act on
 * `is_main_storage = true` resources for the resolved service.
 *
 * The pool that backs `is_main_storage` is shared across the service (Plus
 * tier and admins). Regular users must never be able to push to it (S1).
 *
 * Allowed roles:
 *  - `admin` (per-service admin or Appwrite-label admin)
 *  - `plus`  (per-service Plus tier in `service_users`)
 *  - `system` (server-to-server API-key authentication)
 */
export function canWriteMainStorage(c: Context): boolean {
  const role = c.get('serviceRole');
  if (role === 'admin' || role === 'plus' || role === 'system') return true;
  // Fallback for older callers that only set isAdmin.
  if (c.get('isAdmin') === true && c.get('authType') === 'apikey') return true;
  return false;
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
