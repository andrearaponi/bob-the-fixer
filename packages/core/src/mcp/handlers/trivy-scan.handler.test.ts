import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TrivyResultParser } from '../../trivy/trivy-parser.js';

const { mockScan } = vi.hoisted(() => ({ mockScan: vi.fn() }));

// The handler resolves a TrivyScanner via the registry; mock the scanner.
vi.mock('../../trivy/TrivyScanner.js', () => ({
  TrivyScanner: class {
    name = 'trivy';
    type = 'sca';
    scan = mockScan;
  },
}));

import { handleTrivyScanDependencies } from './trivy-scan.handler.js';

const fakeResult = new TrivyResultParser().parse(
  '{"Results":[{"Target":"package-lock.json","Vulnerabilities":[{"VulnerabilityID":"CVE-1","PkgName":"x","InstalledVersion":"1.0","FixedVersion":"1.1","Severity":"HIGH","Title":"boom"}]}]}',
  { projectPath: '/repo', scanId: 't', startedAt: '2026-07-05T00:00:00Z' }
);

describe('handleTrivyScanDependencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScan.mockResolvedValue(fakeResult);
  });

  it('R4.AC1: runs the Trivy scanner and returns a fix-ready text summary', async () => {
    const result = await handleTrivyScanDependencies({ projectPath: '/repo' });
    expect(mockScan).toHaveBeenCalledWith(expect.objectContaining({ projectPath: '/repo' }));
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('DEPENDENCY VULNERABILITIES');
    expect(result.content[0].text).toContain('x 1.0 → 1.1');
    expect(result.content[0].text).toContain('CVE-1');
  });

  it('defaults the project path to the current directory when omitted', async () => {
    await handleTrivyScanDependencies({});
    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: process.cwd() })
    );
  });

  it('propagates scanner errors (e.g. Trivy not installed)', async () => {
    mockScan.mockRejectedValueOnce(new Error('Trivy is not installed or not found on PATH.'));
    await expect(handleTrivyScanDependencies({})).rejects.toThrow(/not installed/);
  });
});
