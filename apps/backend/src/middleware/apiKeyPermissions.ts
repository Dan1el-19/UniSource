import type { Context } from 'hono';
import type { Permission } from '../db/v1/apiKeys';
import { V2Error } from '../lib/v2/errors';

type PermissionContext = Context

export function getApiKeyPermissions(c: PermissionContext): Permission[] {
  return c.get('apiKeyPermissions') ?? [];
}

export function hasApiKeyPermission(c: PermissionContext, permission: Permission): boolean {
  return getApiKeyPermissions(c).includes(permission);
}

export function hasAnyApiKeyPermission(c: PermissionContext, permissions: Permission[]): boolean {
  const actual = getApiKeyPermissions(c);
  return permissions.some((permission) => actual.includes(permission));
}

export function requireApiKeyPermission(c: PermissionContext, permission: Permission): void {
  if (c.get('authType') !== 'apikey') return;
  if (hasApiKeyPermission(c, 'admin')) return;
  if (!hasApiKeyPermission(c, permission)) {
    throw new V2Error('forbidden', 403, `API key permission required: ${permission}`);
  }
}

export function requireAnyApiKeyPermission(c: PermissionContext, permissions: Permission[]): void {
  if (c.get('authType') !== 'apikey') return;
  if (!hasAnyApiKeyPermission(c, permissions)) {
    throw new V2Error('forbidden', 403, `API key permission required: ${permissions.join(' or ')}`);
  }
}
