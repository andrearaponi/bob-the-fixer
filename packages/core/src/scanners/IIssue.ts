/**
 * Unified Issue Interface
 *
 * Represents a security/quality issue from any scanner.
 * This normalizes issues from different sources (SonarQube, Trivy, etc.)
 */

/**
 * Severity levels normalized across all scanners
 */
export type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

/**
 * Issue types normalized across scanners
 */
export type IssueType =
  | 'VULNERABILITY' // Security vulnerability (SAST/SCA)
  | 'BUG' // Code bug (SAST)
  | 'CODE_SMELL' // Code smell (SAST)
  | 'SECURITY_HOTSPOT' // Security hotspot needing review (SAST)
  | 'DEPENDENCY_VULN'; // Dependency vulnerability (SCA)

/**
 * Issue status
 */
export type IssueStatus =
  | 'OPEN' // Issue is open
  | 'CONFIRMED' // Issue confirmed
  | 'RESOLVED' // Issue has been resolved
  | 'CLOSED' // Issue is closed
  | 'FALSE_POSITIVE' // Marked as false positive
  | 'WONT_FIX'; // Won't fix

/**
 * Source scanner identifier
 */
export type IssueSource = 'sonarqube' | 'trivy' | 'unified';

/**
 * Location information for an issue
 */
export interface IssueLocation {
  /** File path relative to project root */
  filePath: string;
  /** Start line number (1-indexed) */
  startLine?: number;
  /** End line number (1-indexed) */
  endLine?: number;
  /** Start column offset */
  startOffset?: number;
  /** End column offset */
  endOffset?: number;
}

/**
 * Remediation information
 */
export interface IssueRemediation {
  /** Estimated effort to fix */
  effort?: string;
  /** Fix recommendation */
  recommendation?: string;
  /** Fixed version (for dependency vulnerabilities) */
  fixedVersion?: string;
  /** Link to more information */
  referenceUrl?: string;
}

/**
 * Unified Issue Interface
 *
 * This interface represents a normalized issue that can come from
 * any security scanner (SAST, SCA, etc.)
 */
export interface IIssue {
  /** Unique identifier for the issue */
  id: string;

  /** Source scanner that detected this issue */
  source: IssueSource;

  /** Issue type */
  type: IssueType;

  /** Normalized severity */
  severity: IssueSeverity;

  /** Current status */
  status: IssueStatus;

  /** Short message describing the issue */
  message: string;

  /** Rule/CVE identifier */
  ruleId: string;

  /** Human-readable rule name */
  ruleName?: string;

  /** Location in code (optional for dependency issues) */
  location?: IssueLocation;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;

  /** Tags associated with the issue */
  tags: string[];

  /** Remediation information */
  remediation?: IssueRemediation;

  /** For dependency vulnerabilities */
  dependency?: {
    packageName: string;
    installedVersion: string;
    vulnerableVersions?: string;
  };

  /** Raw data from the source scanner */
  rawData?: unknown;
}

/**
 * Filter options for querying issues
 */
export interface IssueFilter {
  /** Filter by issue types */
  types?: IssueType[];

  /** Filter by severities */
  severities?: IssueSeverity[];

  /** Filter by status */
  statuses?: IssueStatus[];

  /** Filter by source scanner */
  sources?: IssueSource[];

  /** Filter by rule IDs */
  ruleIds?: string[];

  /** Filter by tags */
  tags?: string[];

  /** Filter by file path pattern */
  filePattern?: string;

  /** Filter issues created after this date */
  createdAfter?: string;

  /** Filter issues updated after this date */
  updatedAfter?: string;

  /** Maximum number of issues to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Include raw data from scanner */
  includeRawData?: boolean;
}

/**
 * Issue counts grouped by a dimension
 */
export interface IssueCountsByDimension {
  bySeverity: Record<IssueSeverity, number>;
  byType: Record<IssueType, number>;
  byStatus: Record<IssueStatus, number>;
  bySource: Record<IssueSource, number>;
}

/**
 * Summary of issues for a scan or project
 */
export interface IssueSummary {
  /** Total number of issues */
  total: number;

  /** Counts grouped by dimensions */
  counts: IssueCountsByDimension;

  /** Top affected files */
  topAffectedFiles: Array<{
    filePath: string;
    issueCount: number;
  }>;
}
