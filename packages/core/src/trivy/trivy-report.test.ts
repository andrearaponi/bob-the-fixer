import { describe, it, expect } from 'vitest';
import { formatTrivyReport } from './trivy-report.js';
import { TrivyResultParser } from './trivy-parser.js';

const parser = new TrivyResultParser();
const params = { projectPath: '/repo', projectKey: 'p', scanId: 's', startedAt: '2026-07-05T00:00:00Z' };

describe('formatTrivyReport', () => {
  it('R4.AC1: renders fix-ready text with package, versions, CVE and fix step', () => {
    const json =
      '{"Results":[{"Target":"package-lock.json","Vulnerabilities":[{"VulnerabilityID":"CVE-2023-12345","PkgName":"lodash","InstalledVersion":"4.17.20","FixedVersion":"4.17.21","Severity":"HIGH","Title":"Prototype pollution","PrimaryURL":"https://x"}]}]}';
    const text = formatTrivyReport(parser.parse(json, params));

    expect(text).toContain('DEPENDENCY VULNERABILITIES');
    expect(text).toContain('lodash 4.17.20 → 4.17.21');
    expect(text).toContain('CVE-2023-12345');
    expect(text).toContain('Fix: update lodash to 4.17.21');
    expect(text).toContain('https://x');
  });

  it('sorts by severity and marks vulnerabilities without a published fix', () => {
    const json =
      '{"Results":[{"Target":"a","Vulnerabilities":[{"VulnerabilityID":"CVE-low","PkgName":"a","InstalledVersion":"1.0","Severity":"LOW"},{"VulnerabilityID":"CVE-crit","PkgName":"b","InstalledVersion":"2.0","Severity":"CRITICAL"}]}]}';
    const text = formatTrivyReport(parser.parse(json, params));

    expect(text.indexOf('CVE-crit')).toBeLessThan(text.indexOf('CVE-low'));
    expect(text).toContain('no fix available yet');
  });

  it('renders a clean message when there are no vulnerabilities', () => {
    const text = formatTrivyReport(parser.parse('{"Results":[]}', params));
    expect(text).toContain('No dependency vulnerabilities found');
  });

  it('R3.AC2: renders the dependency path and a transitive fix hint for an indirect vuln', () => {
    const json = JSON.stringify({
      Results: [
        {
          Target: 'package-lock.json',
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
    const text = formatTrivyReport(parser.parse(json, params));
    expect(text).toContain('Via: express@4 → qs@6');
    expect(text).toContain('bump express@4');
  });

  it('R3.AC2: does not render a Via line for a direct dependency', () => {
    const json = JSON.stringify({
      Results: [
        {
          Target: 'package-lock.json',
          Packages: [
            { ID: 'app@1', Name: 'app', Version: '1', Relationship: 'root', DependsOn: ['lodash@4'] },
            { ID: 'lodash@4', Name: 'lodash', Version: '4', Relationship: 'direct', DependsOn: [] },
          ],
          Vulnerabilities: [
            { VulnerabilityID: 'CVE-2', PkgName: 'lodash', PkgID: 'lodash@4', InstalledVersion: '4', FixedVersion: '4.1', Severity: 'HIGH' },
          ],
        },
      ],
    });
    const text = formatTrivyReport(parser.parse(json, params));
    expect(text).not.toContain('Via:');
  });
});
