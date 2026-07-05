/**
 * In-Memory Scan Repository
 *
 * Simple in-memory implementation of IScanRepository.
 * Useful for testing and development.
 */

import { IScanRepository, ScanStatistics } from '../IScanRepository.js';
import { ScanRecord, ScanHistoryOptions } from '../../scanners/IScanResult.js';
import { IssueSource } from '../../scanners/IIssue.js';

export class InMemoryScanRepository implements IScanRepository {
  private scans: Map<string, ScanRecord> = new Map();

  /**
   * Deep clone a scan record
   */
  private clone(scan: ScanRecord): ScanRecord {
    return JSON.parse(JSON.stringify(scan));
  }

  async save(scan: ScanRecord): Promise<void> {
    this.scans.set(scan.scanId, this.clone(scan));
  }

  async getById(scanId: string): Promise<ScanRecord | null> {
    const scan = this.scans.get(scanId);
    return scan ? this.clone(scan) : null;
  }

  async getByProject(
    projectKey: string,
    options?: ScanHistoryOptions
  ): Promise<ScanRecord[]> {
    let results = Array.from(this.scans.values()).filter(
      (scan) => scan.projectKey === projectKey
    );

    // Apply filters
    if (options?.source) {
      results = results.filter((scan) => scan.source === options.source);
    }
    if (options?.scannerType) {
      results = results.filter((scan) => scan.scannerType === options.scannerType);
    }
    if (options?.startDate) {
      const start = new Date(options.startDate);
      results = results.filter((scan) => new Date(scan.scannedAt) >= start);
    }
    if (options?.endDate) {
      const end = new Date(options.endDate);
      results = results.filter((scan) => new Date(scan.scannedAt) <= end);
    }

    // Sort by date descending
    results.sort(
      (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
    );

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return results.map((scan) => this.clone(scan));
  }

  async getRecent(limit: number = 10): Promise<ScanRecord[]> {
    const results = Array.from(this.scans.values())
      .sort(
        (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
      )
      .slice(0, limit);

    return results.map((scan) => this.clone(scan));
  }

  async getLatest(
    projectKey: string,
    source?: IssueSource
  ): Promise<ScanRecord | null> {
    let results = Array.from(this.scans.values()).filter(
      (scan) => scan.projectKey === projectKey
    );

    if (source) {
      results = results.filter((scan) => scan.source === source);
    }

    if (results.length === 0) return null;

    results.sort(
      (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
    );

    return this.clone(results[0]);
  }

  async delete(scanId: string): Promise<boolean> {
    return this.scans.delete(scanId);
  }

  async deleteByProject(projectKey: string): Promise<number> {
    const toDelete = Array.from(this.scans.entries())
      .filter(([_, scan]) => scan.projectKey === projectKey)
      .map(([id]) => id);

    toDelete.forEach((id) => this.scans.delete(id));
    return toDelete.length;
  }

  async count(options?: ScanHistoryOptions): Promise<number> {
    let results = Array.from(this.scans.values());

    if (options?.projectKey) {
      results = results.filter((scan) => scan.projectKey === options.projectKey);
    }
    if (options?.source) {
      results = results.filter((scan) => scan.source === options.source);
    }
    if (options?.scannerType) {
      results = results.filter((scan) => scan.scannerType === options.scannerType);
    }

    return results.length;
  }

  async getStatistics(projectKey?: string): Promise<ScanStatistics> {
    let scans = Array.from(this.scans.values());

    if (projectKey) {
      scans = scans.filter((scan) => scan.projectKey === projectKey);
    }

    const stats: ScanStatistics = {
      totalScans: scans.length,
      byStatus: {
        completed: 0,
        failed: 0,
        pending: 0,
        running: 0,
      },
      bySource: {
        sonarqube: 0,
        trivy: 0,
        unified: 0,
      },
      byType: {
        sast: 0,
        sca: 0,
        unified: 0,
      },
      averageDurationMs: 0,
      lastScanDate: null,
      totalIssuesFound: 0,
    };

    if (scans.length === 0) return stats;

    let totalDuration = 0;
    let latestDate: Date | null = null;

    for (const scan of scans) {
      // Status
      if (scan.status === 'COMPLETED') stats.byStatus.completed++;
      else if (scan.status === 'FAILED') stats.byStatus.failed++;
      else if (scan.status === 'PENDING') stats.byStatus.pending++;
      else if (scan.status === 'RUNNING') stats.byStatus.running++;

      // Source
      if (scan.source in stats.bySource) {
        stats.bySource[scan.source as keyof typeof stats.bySource]++;
      }

      // Type
      if (scan.scannerType in stats.byType) {
        stats.byType[scan.scannerType as keyof typeof stats.byType]++;
      }

      // Duration
      totalDuration += scan.durationMs;

      // Total issues
      stats.totalIssuesFound += scan.summary.total;

      // Latest date
      const scanDate = new Date(scan.scannedAt);
      if (!latestDate || scanDate > latestDate) {
        latestDate = scanDate;
      }
    }

    stats.averageDurationMs = Math.round(totalDuration / scans.length);
    stats.lastScanDate = latestDate?.toISOString() ?? null;

    return stats;
  }

  /**
   * Clear all scans (useful for testing)
   */
  clear(): void {
    this.scans.clear();
  }

  /**
   * Get total number of scans stored
   */
  get size(): number {
    return this.scans.size;
  }
}
