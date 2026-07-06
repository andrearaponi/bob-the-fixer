/**
 * Trivy Result Parser
 *
 * Pure mapping from a `trivy fs --format json` report to the normalized
 * IIssue / IScanResult model. Kept free of I/O so it is testable offline
 * (with a fixture) without Trivy installed.
 */

import { IIssue, IssueSeverity, IssueSummary } from '../scanners/IIssue.js';
import { IScanResult, ScanParams } from '../scanners/IScanResult.js';
import { DependencyGraph, TrivyPackage } from './dependency-graph.js';

/** Subset of the Trivy JSON schema we rely on (other fields may be present). */
interface TrivyVulnerability {
  VulnerabilityID: string;
  PkgName: string;
  PkgID?: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Severity?: string;
  Title?: string;
  Description?: string;
  PrimaryURL?: string;
  CweIDs?: string[];
}

interface TrivyResult {
  Target?: string;
  Class?: string;
  Type?: string;
  Vulnerabilities?: TrivyVulnerability[] | null;
  Packages?: TrivyPackage[] | null;
}

interface TrivyReport {
  SchemaVersion?: number;
  ArtifactName?: string;
  Results?: TrivyResult[] | null;
}

export interface TrivyParseParams {
  projectPath: string;
  projectKey?: string;
  projectName?: string;
  scanId: string;
  startedAt: string;
}

export class TrivyResultParser {
  /**
   * Parse a Trivy JSON report string into a normalized IScanResult.
   * @throws if the JSON is malformed.
   */
  parse(stdout: string, params: TrivyParseParams): IScanResult {
    let report: TrivyReport;
    try {
      report = JSON.parse(stdout) as TrivyReport;
    } catch (error) {
      throw new Error(
        `Failed to parse Trivy JSON output: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const issues: IIssue[] = [];
    for (const result of report.Results ?? []) {
      const target = result.Target ?? '';
      const graph =
        result.Packages && result.Packages.length > 0
          ? new DependencyGraph(result.Packages)
          : undefined;
      for (const vuln of result.Vulnerabilities ?? []) {
        issues.push(this.mapVulnerability(vuln, target, graph, result.Type));
      }
    }

    const projectName = params.projectName ?? report.ArtifactName ?? params.projectKey ?? 'project';
    return {
      scanId: params.scanId,
      source: 'trivy',
      scannerType: 'sca',
      status: 'COMPLETED',
      startedAt: params.startedAt,
      completedAt: params.startedAt,
      project: {
        key: params.projectKey ?? report.ArtifactName ?? projectName,
        name: projectName,
        path: params.projectPath,
      },
      issues,
      summary: this.buildSummary(issues),
      metrics: { filesScanned: (report.Results ?? []).length, durationMs: 0 },
    };
  }

  private mapVulnerability(
    vuln: TrivyVulnerability,
    target: string,
    graph?: DependencyGraph,
    ecosystem?: string
  ): IIssue {
    const message =
      vuln.Title || (vuln.Description ? vuln.Description.split('\n')[0] : vuln.VulnerabilityID);
    const dependency: IIssue['dependency'] = {
      packageName: vuln.PkgName,
      installedVersion: vuln.InstalledVersion,
    };
    if (ecosystem) dependency.ecosystem = ecosystem;
    if (graph && vuln.PkgID) {
      const resolved = graph.pathTo(vuln.PkgID);
      dependency.path = resolved.path;
      dependency.directDependency = resolved.directDependency;
      dependency.relationship = resolved.relationship;
    }
    return {
      id: `${vuln.VulnerabilityID}:${vuln.PkgName}`,
      source: 'trivy',
      type: 'DEPENDENCY_VULN',
      severity: this.normalizeSeverity(vuln.Severity),
      status: 'OPEN',
      message,
      ruleId: vuln.VulnerabilityID,
      location: target ? { filePath: target } : undefined,
      createdAt: '',
      updatedAt: '',
      tags: vuln.CweIDs ?? [],
      remediation:
        vuln.FixedVersion || vuln.PrimaryURL
          ? { fixedVersion: vuln.FixedVersion, referenceUrl: vuln.PrimaryURL }
          : undefined,
      dependency,
      rawData: vuln,
    };
  }

  private normalizeSeverity(severity?: string): IssueSeverity {
    const mapping: Record<string, IssueSeverity> = {
      CRITICAL: 'CRITICAL',
      HIGH: 'HIGH',
      MEDIUM: 'MEDIUM',
      LOW: 'LOW',
      UNKNOWN: 'INFO',
    };
    return mapping[(severity ?? '').toUpperCase()] ?? 'INFO';
  }

  private buildSummary(issues: IIssue[]): IssueSummary {
    const bySeverity: Record<IssueSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    for (const issue of issues) bySeverity[issue.severity]++;
    return {
      total: issues.length,
      counts: {
        bySeverity,
        byType: {
          VULNERABILITY: 0,
          BUG: 0,
          CODE_SMELL: 0,
          SECURITY_HOTSPOT: 0,
          DEPENDENCY_VULN: issues.length,
        },
        byStatus: { OPEN: issues.length, CONFIRMED: 0, RESOLVED: 0, CLOSED: 0, FALSE_POSITIVE: 0, WONT_FIX: 0 },
        bySource: { sonarqube: 0, trivy: issues.length, unified: 0 },
      },
      topAffectedFiles: [],
    };
  }
}
