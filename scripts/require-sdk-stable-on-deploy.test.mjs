import test from 'node:test';
import assert from 'node:assert/strict';

import { isStableVersion } from './require-sdk-stable-on-deploy.mjs';

test('stable version returns true', () => {
  assert.equal(isStableVersion('1.1.0'), true);
});

test('beta version returns false', () => {
  assert.equal(isStableVersion('1.2.0-beta.0'), false);
});

test('rc version returns false', () => {
  assert.equal(isStableVersion('2.0.0-rc.1'), false);
});

test('alpha version returns false', () => {
  assert.equal(isStableVersion('1.0.0-alpha.5'), false);
});
