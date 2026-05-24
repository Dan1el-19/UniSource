import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function computeTargetRange(version, mode) {
  if (!['workspace', 'npm', 'npm-exact'].includes(mode)) {
    throw new Error('Invalid mode');
  }

  const isPrerelease = version.includes('-');

  if (mode === 'workspace') {
    return 'workspace:*';
  } else if (mode === 'npm') {
    if (isPrerelease) {
      throw new Error(
        `Refusing to set SDK npm dependency to prerelease "${version}" via 'npm' mode. ` +
          `Backend deploys must use stable @unisource/sdk releases. ` +
          `Use 'npm-exact' for explicit pin or bump SDK to a stable version first.`
      );
    }
    return `^${version}`;
  } else if (mode === 'npm-exact') {
    if (isPrerelease) {
      throw new Error(
        `Refusing to set SDK npm dependency to prerelease "${version}" in production deploy. ` +
          `Backend deploys require stable @unisource/sdk. Promote beta to stable before deploying.`
      );
    }
    return version;
  }
}

async function main() {
  const mode = process.argv[2];

  const root = process.cwd();
  const sdkPkgPath = resolve(root, 'packages/unisource-sdk/package.json');
  const appPackagePaths = [
    resolve(root, 'apps/frontend/package.json'),
    resolve(root, 'apps/backend/package.json'),
  ];

  const sdkPkg = JSON.parse(await readFile(sdkPkgPath, 'utf8'));
  const targetRange = computeTargetRange(sdkPkg.version, mode);

  for (const appPkgPath of appPackagePaths) {
    const appPkg = JSON.parse(await readFile(appPkgPath, 'utf8'));
    appPkg.dependencies ??= {};
    appPkg.dependencies['@unisource/sdk'] = targetRange;
    await writeFile(appPkgPath, `${JSON.stringify(appPkg, null, 2)}\n`, 'utf8');
  }

  console.log(`Set @unisource/sdk dependency to ${targetRange} for frontend and backend apps.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
