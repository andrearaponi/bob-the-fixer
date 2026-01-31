/**
 * SonarQube Scanner
 *
 * Implements the IScanner interface for SonarQube SAST scanning.
 * This is the main entry point for SonarQube integration.
 */

import { injectable, inject } from 'tsyringe';
import {
  IScanner,
  ScannerConfig,
  ScannerHealthStatus,
  BaseScannerImpl,
} from '../../scanners/IScanner.js';
import {
  IIssue,
  IssueFilter,
  IssueSeverity,
  IssueType,
  IssueStatus,
} from '../../scanners/IIssue.js';
import { IScanResult, ScanParams } from '../../scanners/IScanResult.js';
import { SonarQubeApiClient } from '../api/SonarQubeApiClient.js';
import { RuleCache } from '../cache/RuleCache.js';
import { SonarIssue, IssueFilter as SonarIssueFilter } from '../types.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';

/**
 * Configuration for SonarQubeScanner
 */
export interface SonarQubeScannerConfig extends ScannerConfig {
  options?: {
    /** SonarQube server URL */
    baseUrl?: string;
    /** Authentication token */
    token?: string;
    /** Default project key */
    projectKey?: string;
    /** Rule cache TTL in ms */
    ruleCacheTtlMs?: number;
  };
}

/**
 * SonarQubeScanner - SAST scanner implementation for SonarQube
 *
 * This class implements the IScanner interface and provides:
 * - Issue retrieval with unified format
 * - Rule caching for performance
 * - Health checking
 *
 * Note: Actual scanning (triggering analysis) is handled by the existing
 * SonarQubeClient until full migration is complete.
 */
@injectable()
export class SonarQubeScanner extends BaseScannerImpl implements IScanner {
  readonly name = 'sonarqube';
  readonly type = 'sast' as const;

  private apiClient: SonarQubeApiClient | null = null;
  private ruleCache: RuleCache;
  private projectKey: string | null = null;

  constructor(
    @inject(TOKENS.SonarQubeApiClient) apiClient?: SonarQubeApiClient,
    @inject(TOKENS.RuleCache) ruleCache?: RuleCache
  ) {
    super();
    this.apiClient = apiClient ?? null;
    this.ruleCache = ruleCache ?? new RuleCache();
  }

  /**
   * Initialize the scanner with configuration
   */
  initialize(config: {
    baseUrl: string;
    token: string;
    projectKey?: string;
    ruleCacheTtlMs?: number;
  }): void {
    this.apiClient = new SonarQubeApiClient({
      baseUrl: config.baseUrl,
      token: config.token,
    });
    this.projectKey = config.projectKey ?? null;
    this.ruleCache = new RuleCache({ ttlMs: config.ruleCacheTtlMs });
  }

  /**
   * Run a scan on the specified project
   *
   * Note: This method currently throws as full scanning is delegated
   * to the existing SonarQubeClient. It will be fully implemented
   * after the client migration is complete.
   */
  async scan(params: ScanParams): Promise<IScanResult> {
    // For now, scanning is delegated to the existing SonarQubeClient
    // This will be fully implemented after migration
    throw new Error(
      'scan() is not yet implemented in SonarQubeScanner. ' +
        'Use the existing SonarQubeClient for triggering analysis.'
    );
  }

  /**
   * Get issues from SonarQube with optional filtering
   */
  async getIssues(projectKey: string, filter?: IssueFilter): Promise<IIssue[]> {
    if (!this.apiClient) {
      throw new Error('SonarQubeScanner not initialized. Call initialize() first.');
    }

    const effectiveProjectKey = projectKey || this.projectKey;
    if (!effectiveProjectKey) {
      throw new Error('Project key is required');
    }

    // Convert unified filter to SonarQube filter
    const sonarFilter = this.convertToSonarFilter(filter);

    // Fetch issues from SonarQube API
    const issues = await this.apiClient.getPaginated<SonarIssue>(
      '/api/issues/search',
      {
        componentKeys: effectiveProjectKey,
        resolved: filter?.statuses?.includes('RESOLVED') ?? false,
        ...this.buildSonarFilterParams(sonarFilter),
        _t: Date.now(), // Cache busting
      },
      { itemsKey: 'issues', pageSize: 500 }
    );

    // Convert to unified format
    return issues.map((issue) => this.convertToUnifiedIssue(issue));
  }

  /**
   * Check if SonarQube is available and properly configured
   */
  async checkHealth(): Promise<ScannerHealthStatus> {
    if (!this.apiClient) {
      return {
        available: false,
        errorMessage: 'Scanner not initialized',
        lastChecked: new Date().toISOString(),
      };
    }

    const result = await this.apiClient.checkConnection();

    return {
      available: result.connected,
      version: result.version,
      errorMessage: result.error,
      lastChecked: new Date().toISOString(),
      details: {
        baseUrl: this.apiClient.baseUrl,
      },
    };
  }

  /**
   * Convert unified IssueFilter to SonarQube-specific filter
   */
  private convertToSonarFilter(filter?: IssueFilter): SonarIssueFilter {
    if (!filter) return {};

    const sonarFilter: SonarIssueFilter = {};

    // Map severity levels
    if (filter.severities) {
      sonarFilter.severities = filter.severities.map((s) =>
        this.mapUnifiedToSonarSeverity(s)
      );
    }

    // Map issue types
    if (filter.types) {
      sonarFilter.types = filter.types
        .filter((t) => t !== 'DEPENDENCY_VULN') // SonarQube doesn't have this type
        .map((t) => this.mapUnifiedToSonarType(t));
    }

    // Map rule IDs
    if (filter.ruleIds) {
      sonarFilter.rules = filter.ruleIds;
    }

    // Map tags
    if (filter.tags) {
      sonarFilter.tags = filter.tags;
    }

    // Map date filter
    if (filter.createdAfter) {
      sonarFilter.since = filter.createdAfter;
    }

    return sonarFilter;
  }

  /**
   * Build SonarQube API filter parameters
   */
  private buildSonarFilterParams(filter: SonarIssueFilter): Record<string, string | undefined> {
    return {
      types: filter.types?.join(','),
      severities: filter.severities?.join(','),
      languages: filter.languages?.join(','),
      rules: filter.rules?.join(','),
      since: filter.since,
      statuses: filter.statuses?.join(',') ?? 'OPEN,REOPENED',
      tags: filter.tags?.join(','),
    };
  }

  /**
   * Convert SonarQube issue to unified IIssue format
   */
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
      remediation: sonarIssue.effort
        ? {
            effort: sonarIssue.effort,
          }
        : undefined,
      rawData: sonarIssue,
    };
  }

  /**
   * Map SonarQube severity to unified severity
   */
  private mapSonarToUnifiedSeverity(
    sonarSeverity: 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER'
  ): IssueSeverity {
    const mapping: Record<string, IssueSeverity> = {
      BLOCKER: 'CRITICAL',
      CRITICAL: 'CRITICAL',
      MAJOR: 'HIGH',
      MINOR: 'MEDIUM',
      INFO: 'INFO',
    };
    return mapping[sonarSeverity] ?? 'INFO';
  }

  /**
   * Map unified severity to SonarQube severity
   */
  private mapUnifiedToSonarSeverity(
    severity: IssueSeverity
  ): 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER' {
    const mapping: Record<IssueSeverity, 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER'> = {
      CRITICAL: 'BLOCKER',
      HIGH: 'CRITICAL',
      MEDIUM: 'MAJOR',
      LOW: 'MINOR',
      INFO: 'INFO',
    };
    return mapping[severity];
  }

  /**
   * Map SonarQube type to unified type
   */
  private mapSonarToUnifiedType(
    sonarType: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT'
  ): IssueType {
    const mapping: Record<string, IssueType> = {
      BUG: 'BUG',
      VULNERABILITY: 'VULNERABILITY',
      CODE_SMELL: 'CODE_SMELL',
      SECURITY_HOTSPOT: 'SECURITY_HOTSPOT',
    };
    return mapping[sonarType] ?? 'CODE_SMELL';
  }

  /**
   * Map unified type to SonarQube type
   */
  private mapUnifiedToSonarType(
    type: IssueType
  ): 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT' {
    const mapping: Record<IssueType, 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT'> =
      {
        BUG: 'BUG',
        VULNERABILITY: 'VULNERABILITY',
        CODE_SMELL: 'CODE_SMELL',
        SECURITY_HOTSPOT: 'SECURITY_HOTSPOT',
        DEPENDENCY_VULN: 'VULNERABILITY', // Map to closest SonarQube type
      };
    return mapping[type];
  }

  /**
   * Map SonarQube status to unified status
   */
  private mapSonarToUnifiedStatus(sonarStatus: string): IssueStatus {
    const mapping: Record<string, IssueStatus> = {
      OPEN: 'OPEN',
      CONFIRMED: 'CONFIRMED',
      REOPENED: 'OPEN',
      RESOLVED: 'RESOLVED',
      CLOSED: 'CLOSED',
      TO_REVIEW: 'OPEN',
      REVIEWED: 'RESOLVED',
    };
    return mapping[sonarStatus] ?? 'OPEN';
  }

  /**
   * Extract file path from component key
   * Component keys are typically: projectKey:path/to/file.java
   */
  private extractFilePath(componentKey: string): string {
    const parts = componentKey.split(':');
    return parts.length > 1 ? parts.slice(1).join(':') : componentKey;
  }
}
