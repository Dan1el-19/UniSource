import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const mode = process.argv[2];

if (mode !== 'workspace' && mode !== 'npm') {
  console.error('Usage: node scripts/set-app-sdk-source.mjs <workspace|npm>');
  process.exit(1);
}

const root = process.cwd();
const sdkPkgPath = resolve(root, 'packages/unisource-sdk/package.json');
const appPackagePaths = [
  resolve(root, 'apps/frontend/package.json'),
  resolve(root, 'apps/backend/package.json'),
];

const sdkPkg = JSON.parse(await readFile(sdkPkgPath, 'utf8'));
const targetRange = mode === 'workspace' ? 'workspace:*' : `^${sdkPkg.version}`;

for (const appPkgPath of appPackagePaths) {
  const appPkg = JSON.parse(await readFile(appPkgPath, 'utf8'));
  appPkg.dependencies ??= {};
  appPkg.dependencies['@unisource/sdk'] = targetRange;
  await writeFile(appPkgPath, `${JSON.stringify(appPkg, null, 2)}\n`, 'utf8');
}

console.log(`Set @unisource/sdk dependency to ${targetRange} for frontend and backend apps.`);
