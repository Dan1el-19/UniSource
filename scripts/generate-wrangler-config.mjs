import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const app = process.argv[2];
if (app !== 'backend' && app !== 'frontend') {
  throw new Error('Usage: node scripts/generate-wrangler-config.mjs <backend|frontend>');
}

const root = resolve(import.meta.dirname, '..');
const appDir = resolve(root, 'apps', app);
const sourcePath = resolve(appDir, 'wrangler.jsonc');
const outputPath = resolve(appDir, 'wrangler.generated.jsonc');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optional(name) {
  return process.env[name]?.trim() || undefined;
}

function addRoute(config, patternName, zoneName) {
  const pattern = optional(patternName);
  const zone = optional(zoneName);
  if (pattern && zone) {
    config.routes = [{ pattern, zone_name: zone, custom_domain: true }];
  }
}

const config = JSON.parse(await readFile(sourcePath, 'utf8'));
config.name = required('WORKER_NAME');
config.account_id = required('CLOUDFLARE_ACCOUNT_ID');

if (app === 'backend') {
  const primaryBucket = required('PRIMARY_R2_BUCKET_NAME');
  const secondaryBucket = optional('SECONDARY_R2_BUCKET_NAME');
  const primaryBucketKey = optional('PRIMARY_R2_BUCKET_KEY') ?? 'primary';
  const secondaryBucketKey = optional('SECONDARY_R2_BUCKET_KEY') ?? 'secondary';

  config.d1_databases = [
    {
      binding: 'APP_DB',
      database_name: required('D1_DATABASE_NAME'),
      database_id: required('D1_DATABASE_ID'),
      migrations_dir: 'src/db/migrations',
    },
  ];
  config.r2_buckets = [
    { binding: 'PRIMARY_BUCKET', bucket_name: primaryBucket },
    ...(secondaryBucket ? [{ binding: 'SECONDARY_BUCKET', bucket_name: secondaryBucket }] : []),
  ];
  config.vars = {
    ...(config.vars ?? {}),
    R2_BUCKET_BINDINGS: JSON.stringify({
      [primaryBucketKey]: 'PRIMARY_BUCKET',
      ...(secondaryBucket ? { [secondaryBucketKey]: 'SECONDARY_BUCKET' } : {}),
    }),
    R2_BUCKET_NAMES: JSON.stringify({
      [primaryBucketKey]: primaryBucket,
      ...(secondaryBucket ? { [secondaryBucketKey]: secondaryBucket } : {}),
    }),
  };
  addRoute(config, 'BACKEND_ROUTE_PATTERN', 'BACKEND_ROUTE_ZONE_NAME');
}

if (app === 'frontend') {
  addRoute(config, 'FRONTEND_ROUTE_PATTERN', 'FRONTEND_ROUTE_ZONE_NAME');
}

await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Generated ${outputPath}`);
