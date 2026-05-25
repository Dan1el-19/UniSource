import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function isStableVersion(version) {
  return !version.includes('-');
}

async function main() {
  const pkg = JSON.parse(await readFile(resolve('packages/unisource-sdk/package.json'), 'utf8'));
  if (!isStableVersion(pkg.version)) {
    console.error(`Backend deploy refuses prerelease SDK ${pkg.version}.`);
    console.error('Promote beta to stable (sek. 3.6 spec) before deploying.');
    process.exit(1);
  }
  console.log(`SDK stable check passed: ${pkg.version}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
