import { describe, it, expect } from 'vitest';
import { validatePermissions, VALID_PERMISSIONS } from '../src/db/v1/apiKeys';

describe('validatePermissions', () => {
  it('should return true for an empty array', () => {
    // An empty array conceptually means no permissions, which is a valid subset of permissions.
    expect(validatePermissions([])).toBe(true);
  });

  it('should return true for a single valid permission', () => {
    expect(validatePermissions([VALID_PERMISSIONS[0]])).toBe(true);
  });

  it('should return true for multiple valid permissions', () => {
    expect(validatePermissions([VALID_PERMISSIONS[0], VALID_PERMISSIONS[1]])).toBe(true);
  });

  it('should return true for all valid permissions', () => {
    // Create a mutable copy of the readonly array for the test
    const allPerms = [...VALID_PERMISSIONS];
    expect(validatePermissions(allPerms)).toBe(true);
  });

  it('should return false for a single invalid permission', () => {
    expect(validatePermissions(['invalid_permission'])).toBe(false);
  });

  it('should return false for an empty string', () => {
    expect(validatePermissions([''])).toBe(false);
  });

  it('should return false for mixed valid and invalid permissions', () => {
    expect(validatePermissions([VALID_PERMISSIONS[0], 'invalid_permission'])).toBe(false);
  });

  it('should be case-sensitive and return false for uppercase valid permissions', () => {
    expect(validatePermissions([VALID_PERMISSIONS[0].toUpperCase()])).toBe(false);
  });

  it('should return true if duplicates of valid permissions are provided', () => {
    expect(validatePermissions([VALID_PERMISSIONS[0], VALID_PERMISSIONS[0]])).toBe(true);
  });
});
