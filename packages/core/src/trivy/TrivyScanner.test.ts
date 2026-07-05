import { describe, it, expect, beforeEach, vi } from 'vitest';

// Controllable execFile mock: tests set `h.impl`; `h.lastCall` records the
// invocation so we can prove no shell string is ever used (R5.AC1).
const h = vi.hoisted(() => ({
  lastCall: { file: '', args: [] as string[] },
  impl: (_file: string, _args: string[]) => ({ stdout: '{"Results":[]}' }) as { stdout?: string; stderr?: string } | Error,
}));

vi.mock('child_process', () => ({
  execFile: (file: string, args: string[], options: unknown, cb: unknown) => {
    const callback = (typeof options === 'function' ? options : cb) as (
      err: unknown,
      res?: { stdout: string; stderr: string }
    ) => void;
    h.lastCall = { file, args };
    const r = h.impl(file, args);
    if (r instanceof Error) callback(r);
    else callback(null, { stdout: r.stdout ?? '', stderr: r.stderr ?? '' });
  },
}));

import { TrivyScanner } from './TrivyScanner.js';

const OK_JSON =
  '{"Results":[{"Target":"package-lock.json","Vulnerabilities":[{"VulnerabilityID":"CVE-1","PkgName":"x","InstalledVersion":"1.0.0","Severity":"HIGH"}]}]}';

describe('TrivyScanner', () => {
  let scanner: TrivyScanner;

  beforeEach(() => {
    scanner = new TrivyScanner();
    h.impl = () => ({ stdout: OK_JSON });
  });

  it('has the trivy name and sca type', () => {
    expect(scanner.name).toBe('trivy');
    expect(scanner.type).toBe('sca');
  });

  it('R1.AC1/R1.AC2: scans a path and returns a normalized IScanResult', async () => {
    const result = await scanner.scan({ projectPath: '/repo' });
    expect(result.source).toBe('trivy');
    expect(result.scannerType).toBe('sca');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].type).toBe('DEPENDENCY_VULN');
  });

  it('R5.AC1: runs trivy via execFile with an argument array (no shell)', async () => {
    await scanner.scan({ projectPath: '/repo/with spaces & metachars' });
    expect(h.lastCall.file).toBe('trivy');
    expect(Array.isArray(h.lastCall.args)).toBe(true);
    expect(h.lastCall.args).toContain('fs');
    expect(h.lastCall.args).toContain('--format');
    // The path is passed as a single literal argument — no shell interpolation.
    expect(h.lastCall.args[h.lastCall.args.length - 1]).toBe('/repo/with spaces & metachars');
  });

  it('R5.AC2: never leaks environment credentials in a scan error', async () => {
    process.env.TRIVY_PASSWORD = 'supersecret-cred';
    h.impl = () => Object.assign(new Error('exit 1'), { code: 1, stderr: 'registry auth failed' });
    try {
      await scanner.scan({ projectPath: '/repo' });
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).not.toContain('supersecret-cred');
    } finally {
      delete process.env.TRIVY_PASSWORD;
    }
  });

  it('R6.AC1: scan throws an actionable error when Trivy is not installed', async () => {
    h.impl = () => Object.assign(new Error('spawn trivy ENOENT'), { code: 'ENOENT' });
    await expect(scanner.scan({ projectPath: '/repo' })).rejects.toThrow(/not installed.*PATH/i);
  });

  it('R6.AC3: scan surfaces a normalized error on non-zero exit', async () => {
    h.impl = () => Object.assign(new Error('exit 1'), { code: 1, stderr: 'trivy internal error' });
    await expect(scanner.scan({ projectPath: '/repo' })).rejects.toThrow(/Trivy scan failed: trivy internal error/);
  });

  describe('checkHealth', () => {
    it('reports available and version when trivy --version succeeds', async () => {
      h.impl = () => ({ stdout: 'Version: 0.50.1\n' });
      const status = await scanner.checkHealth();
      expect(status.available).toBe(true);
      expect(status.version).toBe('0.50.1');
    });

    it('R6.AC2: reports unavailable with install guidance when trivy is missing', async () => {
      h.impl = () => Object.assign(new Error('spawn trivy ENOENT'), { code: 'ENOENT' });
      const status = await scanner.checkHealth();
      expect(status.available).toBe(false);
      expect(status.errorMessage).toMatch(/not installed.*PATH/i);
    });
  });
});
