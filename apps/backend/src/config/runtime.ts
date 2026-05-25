export function parseAllowedOrigins(env: CloudflareBindings): string[] {
  const raw = (env as unknown as { ALLOWED_ORIGINS?: string }).ALLOWED_ORIGINS;
  if (!raw) return [];

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
