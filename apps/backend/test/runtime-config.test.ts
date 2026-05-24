import { describe, expect, it } from 'vitest';
import { parseAllowedOrigins } from '../src/config/runtime';
import { resolveR2BindingName, resolveR2BucketName } from '../src/services/r2';

describe('runtime configuration', () => {
  it('does not expose production origins when ALLOWED_ORIGINS is unset', () => {
    expect(parseAllowedOrigins({} as CloudflareBindings)).toEqual([]);
  });

  it('parses comma-separated CORS origins from ALLOWED_ORIGINS', () => {
    const env = {
      ALLOWED_ORIGINS: 'http://localhost:5173, https://api.example.test ',
    } as unknown as CloudflareBindings;

    expect(parseAllowedOrigins(env)).toEqual(['http://localhost:5173', 'https://api.example.test']);
  });

  it('resolves R2 bindings only from R2_BUCKET_BINDINGS', () => {
    const env = {
      R2_BUCKET_BINDINGS: JSON.stringify({
        primary: 'PRIMARY_BUCKET',
      }),
    } as unknown as CloudflareBindings;

    expect(resolveR2BindingName(env, 'primary')).toBe('PRIMARY_BUCKET');
  });

  it('rejects R2 buckets that are not present in R2_BUCKET_BINDINGS', () => {
    expect(() => resolveR2BindingName({} as CloudflareBindings, 'primary')).toThrow(
      /R2 bucket binding not configured/
    );
  });

  it('resolves physical R2 bucket names only from R2_BUCKET_NAMES', () => {
    const env = {
      R2_BUCKET_NAMES: JSON.stringify({
        primary: 'storage-a',
      }),
    } as unknown as CloudflareBindings;

    expect(resolveR2BucketName(env, 'primary')).toBe('storage-a');
  });
});
