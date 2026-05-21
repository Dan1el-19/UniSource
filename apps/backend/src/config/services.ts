/**
 * Service ID used when no `X-Service-ID` header is provided. The default
 * service is seeded by migration 0003 in the D1 `services` table; auth
 * middleware looks it up dynamically.
 */
export const DEFAULT_SERVICE_ID = 'default';
