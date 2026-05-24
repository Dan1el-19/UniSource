import test from 'node:test';
import assert from 'node:assert/strict';

import { computeNext } from './bump-sdk-prerelease.mjs';

test('patch bump from clean stable produces beta.0', () => {
  assert.equal(computeNext('1.1.0', 'patch', 'beta'), '1.1.1-beta.0');
});

test('minor bump from clean stable produces beta.0', () => {
  assert.equal(computeNext('1.1.0', 'minor', 'beta'), '1.2.0-beta.0');
});

test('major bump from clean stable produces beta.0', () => {
  assert.equal(computeNext('1.1.0', 'major', 'beta'), '2.0.0-beta.0');
});

test('next bump from existing beta increments prerelease number', () => {
  assert.equal(computeNext('1.2.0-beta.3', 'next', 'beta'), '1.2.0-beta.4');
});

test('next bump from clean stable throws', () => {
  assert.throws(
    () => computeNext('1.1.0', 'next', 'beta'),
    /Cannot bump 'next'/
  );
});

test('patch bump from existing beta throws', () => {
  assert.throws(
    () => computeNext('1.2.0-beta.3', 'patch', 'beta'),
    /Cannot bump 'patch'/
  );
});

test('minor bump from existing beta throws', () => {
  assert.throws(
    () => computeNext('1.2.0-beta.3', 'minor', 'beta'),
    /Cannot bump 'minor'/
  );
});

test('major bump from existing beta throws', () => {
  assert.throws(
    () => computeNext('1.2.0-beta.3', 'major', 'beta'),
    /Cannot bump 'major'/
  );
});
