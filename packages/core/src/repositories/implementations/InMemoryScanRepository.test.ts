import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryScanRepository } from './InMemoryScanRepository.js';
import { ScanRecord } from '../../scanners/IScanResult.js';

describe('InMemoryScanRepository', () => {
  let repository: InMemoryScanRepository;

  const createMockScan = (overrides: Partial<ScanRecord> = {}): ScanRecord => ({
    scanId: `scan-${Math.random().toString(36).substring(7)}`,
    projectKey: 'test-project',
    source: 'sonarqube',
    scannerType: 'sast',
    status: 'COMPLETED',
    scannedAt: new Date().toISOString(),
    summary: {
      total: 10,
      critical: 2,
      high: 3,
      medium: 3,
      low: 1,
      info: 1,
    },
    durationMs: 5000,
    ...overrides,
  });

  beforeEach(() => {
    repository = new InMemoryScanRepository();
  });

  describe('save and getById', () => {
    it('should save and retrieve a scan', async () => {
      const scan = createMockScan({ scanId: 'scan-123' });

      await repository.save(scan);
      const retrieved = await repository.getById('scan-123');

      expect(retrieved).toEqual(scan);
    });

    it('should return null for non-existent scan', async () => {
      const result = await repository.getById('non-existent');
      expect(result).toBeNull();
    });

    it('should return a copy of the scan (not reference)', async () => {
      const scan = createMockScan({ scanId: 'scan-123' });
      await repository.save(scan);

      const retrieved = await repository.getById('scan-123');
      retrieved!.summary.total = 999;

      const retrievedAgain = await repository.getById('scan-123');
      expect(retrievedAgain!.summary.total).toBe(10);
    });
  });

  describe('getByProject', () => {
    it('should return scans for a specific project', async () => {
      await repository.save(createMockScan({ scanId: '1', projectKey: 'project-a' }));
      await repository.save(createMockScan({ scanId: '2', projectKey: 'project-a' }));
      await repository.save(createMockScan({ scanId: '3', projectKey: 'project-b' }));

      const results = await repository.getByProject('project-a');

      expect(results).toHaveLength(2);
      expect(results.every((s) => s.projectKey === 'project-a')).toBe(true);
    });

    it('should filter by source', async () => {
      await repository.save(createMockScan({ scanId: '1', source: 'sonarqube' }));
      await repository.save(createMockScan({ scanId: '2', source: 'trivy' }));

      const results = await repository.getByProject('test-project', {
        source: 'sonarqube',
      });

      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('sonarqube');
    });

    it('should filter by scanner type', async () => {
      await repository.save(createMockScan({ scanId: '1', scannerType: 'sast' }));
      await repository.save(createMockScan({ scanId: '2', scannerType: 'sca' }));

      const results = await repository.getByProject('test-project', {
        scannerType: 'sca',
      });

      expect(results).toHaveLength(1);
      expect(results[0].scannerType).toBe('sca');
    });

    it('should filter by date range', async () => {
      await repository.save(
        createMockScan({ scanId: '1', scannedAt: '2024-01-15T10:00:00Z' })
      );
      await repository.save(
        createMockScan({ scanId: '2', scannedAt: '2024-01-20T10:00:00Z' })
      );
      await repository.save(
        createMockScan({ scanId: '3', scannedAt: '2024-01-25T10:00:00Z' })
      );

      const results = await repository.getByProject('test-project', {
        startDate: '2024-01-16T00:00:00Z',
        endDate: '2024-01-24T00:00:00Z',
      });

      expect(results).toHaveLength(1);
      expect(results[0].scanId).toBe('2');
    });

    it('should sort by date descending', async () => {
      await repository.save(
        createMockScan({ scanId: 'old', scannedAt: '2024-01-10T10:00:00Z' })
      );
      await repository.save(
        createMockScan({ scanId: 'new', scannedAt: '2024-01-20T10:00:00Z' })
      );
      await repository.save(
        createMockScan({ scanId: 'mid', scannedAt: '2024-01-15T10:00:00Z' })
      );

      const results = await repository.getByProject('test-project');

      expect(results[0].scanId).toBe('new');
      expect(results[1].scanId).toBe('mid');
      expect(results[2].scanId).toBe('old');
    });

    it('should apply pagination', async () => {
      for (let i = 0; i < 10; i++) {
        await repository.save(
          createMockScan({
            scanId: `scan-${i}`,
            scannedAt: new Date(2024, 0, i + 1).toISOString(),
          })
        );
      }

      const page1 = await repository.getByProject('test-project', {
        offset: 0,
        limit: 3,
      });
      const page2 = await repository.getByProject('test-project', {
        offset: 3,
        limit: 3,
      });

      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);
      expect(page1[0].scanId).not.toBe(page2[0].scanId);
    });
  });

  describe('getRecent', () => {
    it('should return recent scans sorted by date', async () => {
      await repository.save(
        createMockScan({
          scanId: 'old',
          projectKey: 'project-a',
          scannedAt: '2024-01-10T10:00:00Z',
        })
      );
      await repository.save(
        createMockScan({
          scanId: 'new',
          projectKey: 'project-b',
          scannedAt: '2024-01-20T10:00:00Z',
        })
      );

      const results = await repository.getRecent(2);

      expect(results[0].scanId).toBe('new');
      expect(results[1].scanId).toBe('old');
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 10; i++) {
        await repository.save(createMockScan({ scanId: `scan-${i}` }));
      }

      const results = await repository.getRecent(5);
      expect(results).toHaveLength(5);
    });
  });

  describe('getLatest', () => {
    it('should return latest scan for project', async () => {
      await repository.save(
        createMockScan({
          scanId: 'old',
          projectKey: 'project-a',
          scannedAt: '2024-01-10T10:00:00Z',
        })
      );
      await repository.save(
        createMockScan({
          scanId: 'new',
          projectKey: 'project-a',
          scannedAt: '2024-01-20T10:00:00Z',
        })
      );

      const result = await repository.getLatest('project-a');

      expect(result?.scanId).toBe('new');
    });

    it('should filter by source', async () => {
      await repository.save(
        createMockScan({
          scanId: 'sonar-scan',
          source: 'sonarqube',
          scannedAt: '2024-01-20T10:00:00Z',
        })
      );
      await repository.save(
        createMockScan({
          scanId: 'trivy-scan',
          source: 'trivy',
          scannedAt: '2024-01-25T10:00:00Z',
        })
      );

      const result = await repository.getLatest('test-project', 'sonarqube');

      expect(result?.scanId).toBe('sonar-scan');
    });

    it('should return null when no scans exist', async () => {
      const result = await repository.getLatest('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a scan', async () => {
      await repository.save(createMockScan({ scanId: 'scan-123' }));

      const deleted = await repository.delete('scan-123');

      expect(deleted).toBe(true);
      expect(await repository.getById('scan-123')).toBeNull();
    });

    it('should return false when scan does not exist', async () => {
      const deleted = await repository.delete('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('deleteByProject', () => {
    it('should delete all scans for a project', async () => {
      await repository.save(createMockScan({ scanId: '1', projectKey: 'project-a' }));
      await repository.save(createMockScan({ scanId: '2', projectKey: 'project-a' }));
      await repository.save(createMockScan({ scanId: '3', projectKey: 'project-b' }));

      const deleted = await repository.deleteByProject('project-a');

      expect(deleted).toBe(2);
      expect(await repository.getByProject('project-a')).toHaveLength(0);
      expect(await repository.getByProject('project-b')).toHaveLength(1);
    });
  });

  describe('count', () => {
    it('should count all scans', async () => {
      await repository.save(createMockScan({ scanId: '1' }));
      await repository.save(createMockScan({ scanId: '2' }));

      const count = await repository.count();
      expect(count).toBe(2);
    });

    it('should count with filters', async () => {
      await repository.save(createMockScan({ scanId: '1', source: 'sonarqube' }));
      await repository.save(createMockScan({ scanId: '2', source: 'trivy' }));
      await repository.save(createMockScan({ scanId: '3', source: 'trivy' }));

      const count = await repository.count({ source: 'trivy' });
      expect(count).toBe(2);
    });
  });

  describe('getStatistics', () => {
    it('should return empty statistics when no scans', async () => {
      const stats = await repository.getStatistics();

      expect(stats.totalScans).toBe(0);
      expect(stats.averageDurationMs).toBe(0);
      expect(stats.lastScanDate).toBeNull();
    });

    it('should calculate statistics correctly', async () => {
      await repository.save(
        createMockScan({
          scanId: '1',
          status: 'COMPLETED',
          source: 'sonarqube',
          scannerType: 'sast',
          durationMs: 5000,
          summary: { total: 10, critical: 2, high: 3, medium: 3, low: 1, info: 1 },
        })
      );
      await repository.save(
        createMockScan({
          scanId: '2',
          status: 'COMPLETED',
          source: 'trivy',
          scannerType: 'sca',
          durationMs: 3000,
          summary: { total: 5, critical: 1, high: 1, medium: 1, low: 1, info: 1 },
        })
      );
      await repository.save(
        createMockScan({
          scanId: '3',
          status: 'FAILED',
          source: 'sonarqube',
          scannerType: 'sast',
          durationMs: 1000,
          summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
        })
      );

      const stats = await repository.getStatistics();

      expect(stats.totalScans).toBe(3);
      expect(stats.byStatus.completed).toBe(2);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.bySource.sonarqube).toBe(2);
      expect(stats.bySource.trivy).toBe(1);
      expect(stats.byType.sast).toBe(2);
      expect(stats.byType.sca).toBe(1);
      expect(stats.averageDurationMs).toBe(3000); // (5000 + 3000 + 1000) / 3
      expect(stats.totalIssuesFound).toBe(15); // 10 + 5 + 0
    });

    it('should filter statistics by project', async () => {
      await repository.save(
        createMockScan({
          scanId: '1',
          projectKey: 'project-a',
          summary: { total: 10, critical: 2, high: 3, medium: 3, low: 1, info: 1 },
        })
      );
      await repository.save(
        createMockScan({
          scanId: '2',
          projectKey: 'project-b',
          summary: { total: 5, critical: 1, high: 1, medium: 1, low: 1, info: 1 },
        })
      );

      const stats = await repository.getStatistics('project-a');

      expect(stats.totalScans).toBe(1);
      expect(stats.totalIssuesFound).toBe(10);
    });
  });

  describe('clear and size', () => {
    it('should clear all scans', async () => {
      await repository.save(createMockScan({ scanId: '1' }));
      await repository.save(createMockScan({ scanId: '2' }));

      expect(repository.size).toBe(2);

      repository.clear();

      expect(repository.size).toBe(0);
    });
  });
});
