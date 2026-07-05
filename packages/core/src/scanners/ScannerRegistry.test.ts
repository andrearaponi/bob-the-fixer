import { describe, it, expect, beforeEach } from 'vitest';
import { ScannerRegistry } from './ScannerRegistry.js';
import { IScanner, BaseScannerImpl, ScannerHealthStatus } from './IScanner.js';
import { IScanResult, ScanParams, ScannerType } from './IScanResult.js';

/**
 * A fake scanner the registry has never seen before. Its existence proves
 * R3.AC2: a new IScanner can be registered and driven without changing the
 * registry or any orchestrator. It extends BaseScannerImpl to get the shared
 * config/summary helpers for free.
 */
class FakeScanner extends BaseScannerImpl {
  readonly name: string;
  readonly type: ScannerType;
  public scanCalls = 0;

  constructor(name = 'fake', type: ScannerType = 'sca') {
    super();
    this.name = name;
    this.type = type;
  }

  async scan(params: ScanParams): Promise<IScanResult> {
    this.scanCalls++;
    return {
      scanId: this.generateScanId(),
      source: 'trivy',
      scannerType: this.type,
      status: 'COMPLETED',
      startedAt: new Date().toISOString(),
      project: { key: 'k', name: 'n', path: params.projectPath },
      issues: [],
      summary: this.createEmptySummary(),
      metrics: { filesScanned: 0, durationMs: 0 },
    } as IScanResult;
  }

  async checkHealth(): Promise<ScannerHealthStatus> {
    return { available: true, lastChecked: new Date().toISOString() };
  }
}

describe('ScannerRegistry', () => {
  let registry: ScannerRegistry;

  beforeEach(() => {
    registry = new ScannerRegistry();
  });

  it('registers and resolves a scanner by name', () => {
    const scanner = new FakeScanner('sonarqube', 'sast');
    registry.register(scanner);
    expect(registry.get('sonarqube')).toBe(scanner);
    expect(registry.has('sonarqube')).toBe(true);
  });

  it('throws an actionable error when the scanner is unknown', () => {
    registry.register(new FakeScanner('sonarqube', 'sast'));
    expect(() => registry.get('trivy')).toThrowError(/Scanner not found: 'trivy'.*sonarqube/);
  });

  it('rejects duplicate registration', () => {
    registry.register(new FakeScanner('sonarqube', 'sast'));
    expect(() => registry.register(new FakeScanner('sonarqube', 'sast'))).toThrowError(
      /already registered: 'sonarqube'/
    );
  });

  it('lists all registered scanners in registration order', () => {
    registry.register(new FakeScanner('sonarqube', 'sast'));
    registry.register(new FakeScanner('trivy', 'sca'));
    expect(registry.list().map((s) => s.name)).toEqual(['sonarqube', 'trivy']);
  });

  it('filters scanners by type', () => {
    registry.register(new FakeScanner('sonarqube', 'sast'));
    registry.register(new FakeScanner('trivy', 'sca'));
    expect(registry.getByType('sca').map((s) => s.name)).toEqual(['trivy']);
    expect(registry.getByType('sast').map((s) => s.name)).toEqual(['sonarqube']);
  });

  it('R3.AC2: a brand-new scanner type plugs in and runs without touching the registry', async () => {
    // The registry has zero knowledge of "acme-sca"; registering it is enough
    // to make it a first-class, runnable scanner.
    const newcomer = new FakeScanner('acme-sca', 'sca');
    registry.register(newcomer);

    const resolved = registry.get('acme-sca');
    const result = await resolved.scan({ projectPath: '/tmp/project' });

    expect(newcomer.scanCalls).toBe(1);
    expect(result.status).toBe('COMPLETED');
    expect(result.project.path).toBe('/tmp/project');
  });
});
