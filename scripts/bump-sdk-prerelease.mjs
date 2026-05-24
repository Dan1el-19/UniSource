import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = resolve('packages/unisource-sdk/package.json');
const TAG = 'beta';

export function computeNext(current, mode, tag) {
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+?)\.(\d+))?$/);
  if (!m) throw new Error(`Cannot parse version: ${current}`);
  let [, major, minor, patch, currentTag, prereleaseN] = m;
  major = +major;
  minor = +minor;
  patch = +patch;

  if (mode === 'next') {
    if (currentTag !== tag) {
      throw new Error(
        `Cannot bump 'next' from non-${tag} version "${current}". ` +
          `Use 'patch', 'minor' or 'major' to start a new beta.`
      );
    }
    return `${major}.${minor}.${patch}-${tag}.${+prereleaseN + 1}`;
  }

  if (currentTag) {
    throw new Error(
      `Cannot bump '${mode}' from prerelease "${current}". Use 'next' to continue, ` +
        `or stabilize first by promoting beta to stable.`
    );
  }

  if (mode === 'patch') return `${major}.${minor}.${patch + 1}-${tag}.0`;
  if (mode === 'minor') return `${major}.${minor + 1}.0-${tag}.0`;
  if (mode === 'major') return `${major + 1}.0.0-${tag}.0`;
  throw new Error('unreachable');
}

async function main() {
  const mode = process.argv[2];
  if (!['patch', 'minor', 'major', 'next'].includes(mode)) {
    throw new Error('Usage: node scripts/bump-sdk-prerelease.mjs <patch|minor|major|next>');
  }

  const pkg = JSON.parse(await readFile(PKG, 'utf8'));
  const current = pkg.version;
  const next = computeNext(current, mode, TAG);

  pkg.version = next;
  await writeFile(PKG, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(next);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
