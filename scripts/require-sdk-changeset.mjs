import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SDK_ROOT = 'packages/unisource-sdk/';
const CHANGESET_ROOT = '.changeset/';
const SDK_RELEASE_ARTIFACTS = new Set([
  'packages/unisource-sdk/package.json',
  'packages/unisource-sdk/CHANGELOG.md',
]);

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function isChangesetFile(path) {
  const normalized = normalizePath(path);
  return (
    normalized.startsWith(CHANGESET_ROOT) &&
    normalized.endsWith('.md') &&
    normalized !== '.changeset/README.md'
  );
}

function isSdkFileRequiringChangeset(path) {
  const normalized = normalizePath(path);

  if (!normalized.startsWith(SDK_ROOT)) {
    return false;
  }

  if (SDK_RELEASE_ARTIFACTS.has(normalized)) {
    return false;
  }

  if (
    normalized.startsWith(`${SDK_ROOT}dist/`) ||
    normalized.endsWith('/README.md') ||
    normalized === `${SDK_ROOT}README.md`
  ) {
    return false;
  }

  return true;
}

export function evaluateSdkChangesetRequirement(changedFiles) {
  const normalizedFiles = changedFiles.map(normalizePath);
  const hasChangeset = normalizedFiles.some(isChangesetFile);
  const hasVersionArtifacts = [...SDK_RELEASE_ARTIFACTS].every((path) =>
    normalizedFiles.includes(path),
  );
  const sdkFilesRequiringChangeset = normalizedFiles.filter(isSdkFileRequiringChangeset);

  return {
    ok: sdkFilesRequiringChangeset.length === 0 || hasChangeset || hasVersionArtifacts,
    hasChangeset,
    hasVersionArtifacts,
    sdkFilesRequiringChangeset,
  };
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function changedFilesFromGit(base, head) {
  const output = execFileSync('git', ['diff', '--name-only', base, head], {
    encoding: 'utf8',
  });

  return output.split(/\r?\n/).filter(Boolean);
}

function resolveBaseRef() {
  const explicitBase = readArg('--base');
  if (explicitBase) {
    return explicitBase;
  }

  const eventBefore = process.env.GITHUB_EVENT_BEFORE;
  if (eventBefore && !/^0+$/.test(eventBefore)) {
    return eventBefore;
  }

  return 'HEAD~1';
}

function resolveHeadRef() {
  return readArg('--head') ?? process.env.GITHUB_SHA ?? 'HEAD';
}

function main() {
  const base = resolveBaseRef();
  const head = resolveHeadRef();
  const changedFiles = changedFilesFromGit(base, head);
  const result = evaluateSdkChangesetRequirement(changedFiles);

  if (result.ok) {
    console.log('SDK changeset guard passed.');
    return;
  }

  console.error('SDK source changed without a changeset.');
  console.error('Add a changeset for @unisource/sdk so CI can publish a new npm version before deploy.');
  console.error('');
  console.error('SDK files requiring a changeset:');
  for (const file of result.sdkFilesRequiringChangeset) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
