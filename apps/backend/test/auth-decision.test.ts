import { describe, expect, it } from 'vitest';
import { resolveAuthDecision } from '../src/middleware/auth';

describe('resolveAuthDecision', () => {
  it('treats folder routes as user routes and prefers JWT bearer tokens', () => {
    const decision = resolveAuthDecision('/folders', 'Bearer header.payload.signature', null);

    expect(decision.routeMode).toBe('user');
    expect(decision.jwtToken).toBe('header.payload.signature');
    expect(decision.apiKeyToken).toBeNull();
  });

  it('keeps API key fallback for dual-auth routes', () => {
    const decision = resolveAuthDecision('/files', 'Bearer service-api-key', null);

    expect(decision.routeMode).toBe('dual');
    expect(decision.jwtToken).toBeNull();
    expect(decision.apiKeyToken).toBe('service-api-key');
  });

  it('keeps API key fallback for releases routes', () => {
    const decision = resolveAuthDecision('/releases/upload/init', 'Bearer service-api-key', null);

    expect(decision.routeMode).toBe('dual');
    expect(decision.jwtToken).toBeNull();
    expect(decision.apiKeyToken).toBe('service-api-key');
  });

  it('keeps API key fallback for main storage routes', () => {
    const decision = resolveAuthDecision('/main', 'Bearer service-api-key', null);

    expect(decision.routeMode).toBe('dual');
    expect(decision.jwtToken).toBeNull();
    expect(decision.apiKeyToken).toBe('service-api-key');
  });

  it('accepts an explicit Appwrite JWT header on dual-auth routes', () => {
    const decision = resolveAuthDecision('/upload/r2/init', 'Bearer service-api-key', 'jwt.header.payload');

    expect(decision.routeMode).toBe('dual');
    expect(decision.jwtToken).toBe('jwt.header.payload');
    expect(decision.apiKeyToken).toBe('service-api-key');
  });
});
