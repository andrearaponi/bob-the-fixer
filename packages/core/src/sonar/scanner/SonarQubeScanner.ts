/**
 * SonarQube Scanner
 *
 * Implements the IScanner / IQueryableScanner interfaces for SonarQube SAST.
 *
 * This is a facade over the existing SonarQube machinery (strangler-fig):
 * - `scan()` drives the existing `ScanOrchestrator` (the Sonar-specific engine)
 *   and returns a normalized `IScanResult`. The native Sonar `ScanResult` is
 *   preserved verbatim in `rawOutput` so the existing text formatter stays
 *   untouched and the tool output does not change.
 * - `getIssues()` reuses the working `SonarQubeClient` (not the dead
 *   `SonarQubeApiClient`) and normalizes the result to `IIssue`.
 *
 * Adding another scanner (e.g. Trivy) is a new IScanner registered in the
 * composition root — this class and the orchestrator are not touched.
 */

import {
  IQueryableScanner,
  ScannerHealthStatus,
  BaseScannerImpl,
} from '../../scanners/IScanner.js';
import { IIssue, IssueFilter, IssueSeverity, IssueType, IssueStatus } from '../../scanners/IIssue.js';
import { IScanResult, ScanParams } from '../../scanners/IScanResult.js';
import { IProjectManager, ISonarAdmin } from '../../infrastructure/interfaces/index.js';
import { ScanOrchestrator } from '../../core/scanning/ScanOrchestrator.js';
import { SonarQubeClient } from '../client.js';
import { SonarIssue, IssueFilter as SonarIssueFilter } from '../types.js';
import { ScanResult, Issue as SonarSummaryIssue } from '../../shared/types/index.js';

export class SonarQubeScanner extends BaseScannerImpl implements IQueryableScanner {
  readonly name = 'sonarqube';
  readonly type = 'sast' as const;

  constructor(
    private readonly projectManager: IProjectManager,
    private readonly sonarAdmin: ISonarAdmin
  ) {
    super();
  }

  /**
   * Run a full SonarQube scan and return a normalized result.
   *
   * The heavy Sonar pipeline (auto-setup, validation, retry, fallback, fetch)
   * lives in `ScanOrchestrator` and is reused as-is. `rawOutput` carries the
   * native `ScanResult` so callers that need the rich Sonar summary keep it.
   */
  async scan(params: ScanParams, correlationId?: string): Promise<IScanResult> {
    // Sonar-specific scan options travel in the generic `options` bag so the
    // IScanner contract stays scanner-agnostic.
    const opts = (params.options ?? {}) as {
      severityFilter?: string[];
      typeFilter?: string[];
      autoSetup?: boolean;
    };
    const orchestrator = new ScanOrchestrator(this.projectManager, this.sonarAdmin);
    const result = await orchestrator.execute(
      {
        projectPath: params.projectPath,
        severityFilter: opts.severityFilter as any,
        typeFilter: opts.typeFilter as any,
        autoSetup: opts.autoSetup,
      },
      correlationId
    );
    return this.toScanResult(result, params);
  }

  /**
   * Get issues from SonarQube, normalized to IIssue. Reuses the working client.
   */
  async getIssues(projectKey: string, filter?: IssueFilter): Promise<IIssue[]> {
    if (!projectKey) {
      throw new Error('Project key is required');
    }
    const config = await this.projectManager.getOrCreateConfig();
    const client = new SonarQubeClient(config.sonarUrl, config.sonarToken, projectKey);
    const sonarIssues = await client.getIssues(this.convertToSonarFilter(filter));
    return sonarIssues.map((issue) => this.convertToUnifiedIssue(issue));
  }

  /**
   * Connectivity health check against the SonarQube instance.
   */
  async checkHealth(): Promise<ScannerHealthStatus> {
    const lastChecked = new Date().toISOString();
    try {
      const config = await this.projectManager.getOrCreateConfig();
      const client = new SonarQubeClient(
        config.sonarUrl,
        config.sonarToken,
        config.sonarProjectKey
      );
      const res = await client.client.get('/api/system/status');
      const up = res.data?.status === 'UP';
      return {
        available: up,
        version: res.data?.version,
        errorMessage: up ? undefined : `SonarQube status: ${res.data?.status ?? 'unknown'}`,
        lastChecked,
        details: { baseUrl: config.sonarUrl },
      };
    } catch (error) {
      return {
        available: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        lastChecked,
      };
    }
  }

  // ---- mapping helpers ----------------------------------------------------

  /** Map the native Sonar ScanResult into the normalized IScanResult. */
  private toScanResult(result: ScanResult, params: ScanParams): IScanResult {
    const startedAt = new Date().toISOString();
    const issues = (result.topIssues ?? []).map((i) => this.convertSummaryIssue(i));
    return {
      scanId: this.generateScanId(),
      source: 'sonarqube',
      scannerType: 'sast',
      status: 'COMPLETED',
      startedAt,
      completedAt: startedAt,
      project: {
        key: result.projectKey,
        name: result.projectContext?.name ?? result.projectKey,
        path: result.projectContext?.path ?? params.projectPath,
      },
      issues,
      summary: {
        total: result.totalIssues ?? issues.length,
        counts: {
          bySeverity: this.severityCounts(result.issuesBySeverity),
          byType: this.typeCounts(result.issuesByType),
          byStatus: { OPEN: 0, CONFIRMED: 0, RESOLVED: 0, CLOSED: 0, FALSE_POSITIVE: 0, WONT_FIX: 0 },
          bySource: { sonarqube: result.totalIssues ?? issues.length, trivy: 0, unified: 0 },
        },
        topAffectedFiles: [],
      },
      metrics: { filesScanned: 0, durationMs: 0 },
      // Native Sonar result preserved verbatim for the existing text formatter.
      rawOutput: result,
    };
  }

  private severityCounts(bySeverity?: Record<string, number>): Record<IssueSeverity, number> {
    const base: Record<IssueSeverity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    if (!bySeverity) return base;
    for (const [k, v] of Object.entries(bySeverity)) {
      const mapped = this.mapSonarToUnifiedSeverity(k as any);
      base[mapped] += v;
    }
    return base;
  }

  private typeCounts(byType?: Record<string, number>): Record<IssueType, number> {
    const base: Record<IssueType, number> = {
      VULNERABILITY: 0, BUG: 0, CODE_SMELL: 0, SECURITY_HOTSPOT: 0, DEPENDENCY_VULN: 0,
    };
    if (!byType) return base;
    for (const [k, v] of Object.entries(byType)) {
      const key = k as IssueType;
      if (key in base) base[key] += v;
    }
    return base;
  }

  private convertSummaryIssue(issue: SonarSummaryIssue): IIssue {
    return {
      id: issue.key,
      source: 'sonarqube',
      type: this.mapSonarToUnifiedType(issue.type as any),
      severity: this.mapSonarToUnifiedSeverity(issue.severity as any),
      status: this.mapSonarToUnifiedStatus(issue.status ?? 'OPEN'),
      message: issue.message,
      ruleId: issue.rule ?? '',
      location: issue.component
        ? { filePath: this.extractFilePath(issue.component), startLine: issue.line }
        : undefined,
      createdAt: '',
      updatedAt: '',
      tags: issue.tags ?? [],
      remediation: issue.effort ? { effort: issue.effort } : undefined,
      rawData: issue,
    };
  }

  private convertToSonarFilter(filter?: IssueFilter): SonarIssueFilter {
    if (!filter) return {};
    const sonarFilter: SonarIssueFilter = {};
    if (filter.severities) {
      sonarFilter.severities = filter.severities.map((s) => this.mapUnifiedToSonarSeverity(s));
    }
    if (filter.types) {
      sonarFilter.types = filter.types
        .filter((t) => t !== 'DEPENDENCY_VULN')
        .map((t) => this.mapUnifiedToSonarType(t));
    }
    if (filter.ruleIds) sonarFilter.rules = filter.ruleIds;
    if (filter.tags) sonarFilter.tags = filter.tags;
    if (filter.createdAfter) sonarFilter.since = filter.createdAfter;
    return sonarFilter;
  }

  private convertToUnifiedIssue(sonarIssue: SonarIssue): IIssue {
    return {
      id: sonarIssue.key,
      source: 'sonarqube',
      type: this.mapSonarToUnifiedType(sonarIssue.type),
      severity: this.mapSonarToUnifiedSeverity(sonarIssue.severity),
      status: this.mapSonarToUnifiedStatus(sonarIssue.status),
      message: sonarIssue.message,
      ruleId: sonarIssue.rule,
      location: sonarIssue.component
        ? {
            filePath: this.extractFilePath(sonarIssue.component),
            startLine: sonarIssue.textRange?.startLine ?? sonarIssue.line,
            endLine: sonarIssue.textRange?.endLine,
            startOffset: sonarIssue.textRange?.startOffset,
            endOffset: sonarIssue.textRange?.endOffset,
          }
        : undefined,
      createdAt: sonarIssue.creationDate,
      updatedAt: sonarIssue.updateDate,
      tags: sonarIssue.tags ?? [],
      remediation: sonarIssue.effort ? { effort: sonarIssue.effort } : undefined,
      rawData: sonarIssue,
    };
  }

  private mapSonarToUnifiedSeverity(
    sonarSeverity: 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER'
  ): IssueSeverity {
    const mapping: Record<string, IssueSeverity> = {
      BLOCKER: 'CRITICAL', CRITICAL: 'CRITICAL', MAJOR: 'HIGH', MINOR: 'MEDIUM', INFO: 'INFO',
    };
    return mapping[sonarSeverity] ?? 'INFO';
  }

  private mapUnifiedToSonarSeverity(
    severity: IssueSeverity
  ): 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER' {
    const mapping: Record<IssueSeverity, 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER'> = {
      CRITICAL: 'BLOCKER', HIGH: 'CRITICAL', MEDIUM: 'MAJOR', LOW: 'MINOR', INFO: 'INFO',
    };
    return mapping[severity];
  }

  private mapSonarToUnifiedType(
    sonarType: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT'
  ): IssueType {
    const mapping: Record<string, IssueType> = {
      BUG: 'BUG', VULNERABILITY: 'VULNERABILITY', CODE_SMELL: 'CODE_SMELL', SECURITY_HOTSPOT: 'SECURITY_HOTSPOT',
    };
    return mapping[sonarType] ?? 'CODE_SMELL';
  }

  private mapUnifiedToSonarType(
    type: IssueType
  ): 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT' {
    const mapping: Record<IssueType, 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT'> = {
      BUG: 'BUG', VULNERABILITY: 'VULNERABILITY', CODE_SMELL: 'CODE_SMELL',
      SECURITY_HOTSPOT: 'SECURITY_HOTSPOT', DEPENDENCY_VULN: 'VULNERABILITY',
    };
    return mapping[type];
  }

  private mapSonarToUnifiedStatus(sonarStatus: string): IssueStatus {
    const mapping: Record<string, IssueStatus> = {
      OPEN: 'OPEN', CONFIRMED: 'CONFIRMED', REOPENED: 'OPEN', RESOLVED: 'RESOLVED',
      CLOSED: 'CLOSED', TO_REVIEW: 'OPEN', REVIEWED: 'RESOLVED',
    };
    return mapping[sonarStatus] ?? 'OPEN';
  }

  private extractFilePath(componentKey: string): string {
    const parts = componentKey.split(':');
    return parts.length > 1 ? parts.slice(1).join(':') : componentKey;
  }
}
