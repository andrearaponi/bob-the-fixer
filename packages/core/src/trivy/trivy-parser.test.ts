import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { TrivyResultParser } from './trivy-parser.js';

const fixture = readFileSync(
  new URL('../../tests/fixtures/trivy-fs-report.json', import.meta.url),
  'utf8'
);

const params = {
  projectPath: '/repo',
  projectKey: 'test-project',
  scanId: 'trivy-1',
  startedAt: '2026-07-05T00:00:00Z',
};

describe('TrivyResultParser', () => {
  const parser = new TrivyResultParser();

  it('parses the fixture into a normalized IScanResult', () => {
    const result = parser.parse(fixture, params);
    expect(result.source).toBe('trivy');
    expect(result.scannerType).toBe('sca');
    expect(result.status).toBe('COMPLETED');
    // lodash + minimist + some-old-lib; the go.mod result has null Vulnerabilities.
    expect(result.issues).toHaveLength(3);
  });

  it('R1.AC3/R2.AC1/R2.AC3: maps a vuln to a normalized DEPENDENCY_VULN issue', () => {
    const result = parser.parse(fixture, params);
    const lodash = result.issues.find((i) => i.dependency?.packageName === 'lodash')!;
    expect(lodash.type).toBe('DEPENDENCY_VULN');
    expect(lodash.source).toBe('trivy');
    expect(lodash.ruleId).toBe('CVE-2023-12345'); // R2.AC3
    expect(lodash.severity).toBe('HIGH');
    expect(lodash.dependency).toEqual({ packageName: 'lodash', installedVersion: '4.17.20' }); // R1.AC3
    expect(lodash.remediation?.fixedVersion).toBe('4.17.21'); // R2.AC1
    expect(lodash.location?.filePath).toBe('package-lock.json');
    expect(lodash.tags).toEqual(['CWE-1321']);
  });

  it('R2.AC2: normalizes severities including UNKNOWN -> INFO', () => {
    const result = parser.parse(fixture, params);
    const byPkg = Object.fromEntries(
      result.issues.map((i) => [i.dependency!.packageName, i.severity])
    );
    expect(byPkg['minimist']).toBe('CRITICAL');
    expect(byPkg['some-old-lib']).toBe('INFO');
  });

  it('handles a missing fixed version and derives the message from the description', () => {
    const result = parser.parse(fixture, params);
    const minimist = result.issues.find((i) => i.dependency?.packageName === 'minimist')!;
    expect(minimist.remediation?.fixedVersion).toBeUndefined();

    const oldLib = result.issues.find((i) => i.dependency?.packageName === 'some-old-lib')!;
    expect(oldLib.message).toBe('A low-confidence advisory with no title.');
    expect(oldLib.remediation?.fixedVersion).toBe('0.2.0');
  });

  it('builds a summary counting DEPENDENCY_VULN and the trivy source', () => {
    const result = parser.parse(fixture, params);
    expect(result.summary.total).toBe(3);
    expect(result.summary.counts.byType.DEPENDENCY_VULN).toBe(3);
    expect(result.summary.counts.bySource.trivy).toBe(3);
    expect(result.summary.counts.bySeverity.CRITICAL).toBe(1);
    expect(result.summary.counts.bySeverity.HIGH).toBe(1);
    expect(result.summary.counts.bySeverity.INFO).toBe(1);
  });

  it('throws a clear error on malformed JSON', () => {
    expect(() => parser.parse('not json{', params)).toThrow(/Failed to parse Trivy JSON/);
  });

  it('R3.AC1: attaches the dependency path when the package graph is present', () => {
    const withGraph = JSON.stringify({
      SchemaVersion: 2,
      Results: [
        {
          Target: 'package-lock.json',
          Class: 'lang-pkgs',
          Type: 'npm',
          Packages: [
            { ID: 'app@1', Name: 'app', Version: '1', Relationship: 'root', DependsOn: ['express@4'] },
            { ID: 'express@4', Name: 'express', Version: '4', Relationship: 'direct', DependsOn: ['qs@6'] },
            { ID: 'qs@6', Name: 'qs', Version: '6', Relationship: 'indirect', DependsOn: [] },
          ],
          Vulnerabilities: [
            { VulnerabilityID: 'CVE-1', PkgName: 'qs', PkgID: 'qs@6', InstalledVersion: '6', FixedVersion: '6.1', Severity: 'HIGH' },
          ],
        },
      ],
    });

    const issue = parser.parse(withGraph, params).issues[0];
    expect(issue.dependency?.relationship).toBe('indirect');
    expect(issue.dependency?.path).toEqual(['express@4', 'qs@6']);
    expect(issue.dependency?.directDependency).toBe('express@4');
  });

  it('R1.AC3: falls back to a flat list (no path) when the package graph is absent', () => {
    // the file fixture has no Packages[] -> no path is attached
    const issue = parser.parse(fixture, params).issues[0];
    expect(issue.dependency?.path).toBeUndefined();
    expect(issue.dependency?.relationship).toBeUndefined();
  });
});
