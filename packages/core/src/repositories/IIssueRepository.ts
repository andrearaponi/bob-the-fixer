/**
 * Issue Repository Interface
 *
 * Defines the contract for persisting and retrieving issues.
 * Implementations can use different storage backends (in-memory, SQLite, etc.)
 */

import { IIssue, IssueFilter, IssueSummary, IssueSource, IssueSeverity } from '../scanners/IIssue.js';

/**
 * Issue repository interface
 *
 * Provides CRUD operations for issues found during scans.
 */
export interface IIssueRepository {
  /**
   * Save an issue
   */
  save(issue: IIssue): Promise<void>;

  /**
   * Save multiple issues (batch)
   */
  saveBatch(issues: IIssue[]): Promise<void>;

  /**
   * Get an issue by ID
   */
  getById(issueId: string): Promise<IIssue | null>;

  /**
   * Get issues with filtering
   */
  getFiltered(filter: IssueFilter): Promise<IIssue[]>;

  /**
   * Get issues for a specific scan
   */
  getByScan(scanId: string): Promise<IIssue[]>;

  /**
   * Get issues for a project
   */
  getByProject(projectKey: string, filter?: IssueFilter): Promise<IIssue[]>;

  /**
   * Update an issue
   */
  update(issueId: string, updates: Partial<IIssue>): Promise<boolean>;

  /**
   * Delete an issue
   */
  delete(issueId: string): Promise<boolean>;

  /**
   * Delete all issues for a scan
   */
  deleteByScan(scanId: string): Promise<number>;

  /**
   * Delete all issues for a project
   */
  deleteByProject(projectKey: string): Promise<number>;

  /**
   * Count issues with optional filtering
   */
  count(filter?: IssueFilter): Promise<number>;

  /**
   * Get issue summary (counts by severity, type, etc.)
   */
  getSummary(projectKey?: string): Promise<IssueSummary>;

  /**
   * Get trends over time
   */
  getTrends(
    projectKey: string,
    options?: {
      startDate?: string;
      endDate?: string;
      groupBy?: 'day' | 'week' | 'month';
    }
  ): Promise<IssueTrend[]>;
}

/**
 * Issue trend data point
 */
export interface IssueTrend {
  /** Date/period */
  date: string;

  /** Total issues at this point */
  total: number;

  /** New issues added */
  added: number;

  /** Issues resolved */
  resolved: number;

  /** Breakdown by severity */
  bySeverity: Record<IssueSeverity, number>;

  /** Breakdown by source */
  bySource: Record<IssueSource, number>;
}
