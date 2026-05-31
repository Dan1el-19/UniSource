import test from 'node:test';
import assert from 'node:assert/strict';

import { computeTargetRange } from './set-app-sdk-source.mjs';

test('workspace mode returns workspace:*', () => {
  assert.equal(computeTargetRange('1.1.0', 'workspace'), 'workspace:*');
});

test('npm mode for stable version returns caret range', () => {
  assert.equal(computeTargetRange('1.1.0', 'npm'), '^1.1.0');
});

test('npm mode for prerelease throws', () => {
  assert.throws(
    () => computeTargetRange('1.2.0-beta.0', 'npm'),
    /Refusing/
  );
});

test('npm-exact mode for stable version returns exact version', () => {
  assert.equal(computeTargetRange('1.1.0', 'npm-exact'), '1.1.0');
});

test('npm-exact mode for prerelease throws', () => {
  assert.throws(
    () => computeTargetRange('1.2.0-beta.0', 'npm-exact'),
    /Refusing/
  );
});
