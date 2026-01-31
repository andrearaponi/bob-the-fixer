/**
 * Scan Repository Interface
 *
 * Defines the contract for persisting and retrieving scan records.
 * Implementations can use different storage backends (in-memory, SQLite, etc.)
 */

import { ScanRecord, ScanHistoryOptions } from '../scanners/IScanResult.js';
import { IssueSource } from '../scanners/IIssue.js';

/**
 * Scan repository interface
 *
 * Provides CRUD operations for scan records.
 * Scan records are lightweight summaries of completed scans.
 */
export interface IScanRepository {
  /**
   * Save a scan record
   */
  save(scan: ScanRecord): Promise<void>;

  /**
   * Get a scan record by ID
   */
  getById(scanId: string): Promise<ScanRecord | null>;

  /**
   * Get all scans for a project
   */
  getByProject(projectKey: string, options?: ScanHistoryOptions): Promise<ScanRecord[]>;

  /**
   * Get recent scans across all projects
   */
  getRecent(limit?: number): Promise<ScanRecord[]>;

  /**
   * Get the latest scan for a project
   */
  getLatest(projectKey: string, source?: IssueSource): Promise<ScanRecord | null>;

  /**
   * Delete a scan record
   */
  delete(scanId: string): Promise<boolean>;

  /**
   * Delete all scans for a project
   */
  deleteByProject(projectKey: string): Promise<number>;

  /**
   * Count total scans
   */
  count(options?: ScanHistoryOptions): Promise<number>;

  /**
   * Get scan statistics
   */
  getStatistics(projectKey?: string): Promise<ScanStatistics>;
}

/**
 * Statistics about scans in the repository
 */
export interface ScanStatistics {
  /** Total number of scans */
  totalScans: number;

  /** Scans by status */
  byStatus: {
    completed: number;
    failed: number;
    pending: number;
    running: number;
  };

  /** Scans by source */
  bySource: {
    sonarqube: number;
    trivy: number;
    unified: number;
  };

  /** Scans by scanner type */
  byType: {
    sast: number;
    sca: number;
    unified: number;
  };

  /** Average duration in milliseconds */
  averageDurationMs: number;

  /** Date of last scan */
  lastScanDate: string | null;

  /** Total issues found across all scans */
  totalIssuesFound: number;
}
