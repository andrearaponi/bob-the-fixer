/**
 * Scanner Interface
 *
 * Common interface for all security scanners (SAST, SCA, etc.)
 * Implementations include SonarQubeScanner and TrivyScanner.
 */

import { IIssue, IssueFilter } from './IIssue.js';
import { IScanResult, ScanParams, ScannerType } from './IScanResult.js';

/**
 * Scanner configuration
 */
export interface ScannerConfig {
  /** Whether the scanner is enabled */
  enabled: boolean;

  /** Scanner-specific configuration */
  options?: Record<string, unknown>;
}

/**
 * Scanner health/connection status
 */
export interface ScannerHealthStatus {
  /** Whether the scanner is available */
  available: boolean;

  /** Scanner version (if available) */
  version?: string;

  /** Additional status information */
  details?: Record<string, unknown>;

  /** Error message if not available */
  errorMessage?: string;

  /** Last successful check timestamp */
  lastChecked: string;
}

/**
 * Common scanner interface
 *
 * All security scanners (SAST, SCA, etc.) implement this interface
 * to provide a consistent API for scanning and issue retrieval.
 */
export interface IScanner {
  /**
   * Unique name of the scanner
   * @example 'sonarqube', 'trivy'
   */
  readonly name: string;

  /**
   * Type of scanner
   * @example 'sast', 'sca'
   */
  readonly type: ScannerType;

  /**
   * Run a scan on the specified project
   *
   * @param params - Scan parameters including project path and options
   * @returns Scan result with issues found
   */
  scan(params: ScanParams): Promise<IScanResult>;

  /**
   * Check if the scanner is available and properly configured
   *
   * @returns Health status of the scanner
   */
  checkHealth(): Promise<ScannerHealthStatus>;

  /**
   * Get the current configuration
   */
  getConfig(): ScannerConfig;

  /**
   * Update scanner configuration
   *
   * @param config - New configuration options
   */
  configure(config: Partial<ScannerConfig>): void;
}

/**
 * Queryable scanner capability.
 *
 * Optional extension for scanners backed by a server-side issue store that can
 * be queried by project key (e.g. SonarQube). Scan-and-return-only scanners
 * such as Trivy do NOT implement this — they surface findings from scan().
 */
export interface IQueryableScanner extends IScanner {
  /**
   * Get issues with optional filtering from the scanner's server-side store.
   *
   * @param projectKey - Project to get issues for
   * @param filter - Optional filter criteria
   * @returns Array of issues matching the filter
   */
  getIssues(projectKey: string, filter?: IssueFilter): Promise<IIssue[]>;
}

/**
 * Type guard: does a scanner support server-side issue queries?
 */
export function isQueryableScanner(scanner: IScanner): scanner is IQueryableScanner {
  return typeof (scanner as Partial<IQueryableScanner>).getIssues === 'function';
}

/**
 * Abstract base class for scanners
 *
 * Provides common functionality that all scanners can inherit.
 */
export abstract class BaseScannerImpl implements IScanner {
  abstract readonly name: string;
  abstract readonly type: ScannerType;

  protected config: ScannerConfig = { enabled: true };

  abstract scan(params: ScanParams): Promise<IScanResult>;
  abstract checkHealth(): Promise<ScannerHealthStatus>;

  getConfig(): ScannerConfig {
    return { ...this.config };
  }

  configure(config: Partial<ScannerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Generate a unique scan ID
   */
  protected generateScanId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create an empty issue summary
   */
  protected createEmptySummary() {
    return {
      total: 0,
      counts: {
        bySeverity: {
          CRITICAL: 0,
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0,
          INFO: 0,
        },
        byType: {
          VULNERABILITY: 0,
          BUG: 0,
          CODE_SMELL: 0,
          SECURITY_HOTSPOT: 0,
          DEPENDENCY_VULN: 0,
        },
        byStatus: {
          OPEN: 0,
          CONFIRMED: 0,
          RESOLVED: 0,
          CLOSED: 0,
          FALSE_POSITIVE: 0,
          WONT_FIX: 0,
        },
        bySource: {
          sonarqube: 0,
          trivy: 0,
          unified: 0,
        },
      },
      topAffectedFiles: [],
    };
  }
}
