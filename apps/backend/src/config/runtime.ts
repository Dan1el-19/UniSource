const DEFAULT_ALLOWED_ORIGINS = [
  'https://app.example.com',
  'https://service-b.pages.dev',
  'https://example.com',
  'https://www.example.com',
  'http://localhost:5173',
  'http://localhost:4321',
  'http://localhost:8788',
];

export function parseAllowedOrigins(env: CloudflareBindings): string[] {
  const raw = (env as unknown as { ALLOWED_ORIGINS?: string }).ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
