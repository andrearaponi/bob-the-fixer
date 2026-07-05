import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockCheckHealth } = vi.hoisted(() => ({ mockCheckHealth: vi.fn() }));

vi.mock('../../trivy/TrivyScanner.js', () => ({
  TrivyScanner: class {
    checkHealth = mockCheckHealth;
  },
}));

import { handleTrivyCheckInstallation } from './trivy-check.handler.js';

describe('handleTrivyCheckInstallation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('R4.AC2: reports installed and version when Trivy is available', async () => {
    mockCheckHealth.mockResolvedValue({ available: true, version: '0.50.1', lastChecked: '' });
    const result = await handleTrivyCheckInstallation({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Trivy is installed');
    expect(result.content[0].text).toContain('0.50.1');
  });

  it('R6.AC1: reports actionable guidance when Trivy is not installed', async () => {
    mockCheckHealth.mockResolvedValue({
      available: false,
      errorMessage: 'Trivy is not installed or not found on PATH. Install it: https://trivy.dev/...',
      lastChecked: '',
    });
    const result = await handleTrivyCheckInstallation({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not installed.*PATH/i);
  });
});
