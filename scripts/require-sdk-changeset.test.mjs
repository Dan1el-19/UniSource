import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateSdkChangesetRequirement } from './require-sdk-changeset.mjs';

test('requires a changeset when SDK source changes', () => {
  const result = evaluateSdkChangesetRequirement([
    'packages/unisource-sdk/src/index.ts',
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.sdkFilesRequiringChangeset, [
    'packages/unisource-sdk/src/index.ts',
  ]);
});

test('allows SDK source changes when a changeset is included', () => {
  const result = evaluateSdkChangesetRequirement([
    'packages/unisource-sdk/src/index.ts',
    '.changeset/sharp-clouds.md',
  ]);

  assert.equal(result.ok, true);
});

test('allows changesets version artifacts without a changeset', () => {
  const result = evaluateSdkChangesetRequirement([
    'packages/unisource-sdk/package.json',
    'packages/unisource-sdk/CHANGELOG.md',
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.sdkFilesRequiringChangeset, []);
});

test('ignores generated SDK dist files and docs', () => {
  const result = evaluateSdkChangesetRequirement([
    'packages/unisource-sdk/dist/index.mjs',
    'packages/unisource-sdk/README.md',
  ]);

  assert.equal(result.ok, true);
});
