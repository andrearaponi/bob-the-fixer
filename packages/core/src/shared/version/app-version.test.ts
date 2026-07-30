import { describe, it, expect } from 'vitest';
import { APP_VERSION } from './app-version.js';
import { getLifecycleManager } from '../../universal/server-lifecycle.js';
import pkg from '../../../package.json';

describe('APP_VERSION', () => {
  it('is read from the package manifest, not hardcoded', () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('looks like a real version', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('reported version does not drift from the manifest', () => {
  it('the lifecycle manager reports the manifest version', () => {
    // Guards the exact sites that used to hardcode a stale '2.0.0'.
    expect(getLifecycleManager().getServerInfo().version).toBe(pkg.version);
  });

  it('the health check reports the manifest version', async () => {
    const health = await getLifecycleManager().performHealthCheck();
    expect(health.version).toBe(pkg.version);
  });
});
