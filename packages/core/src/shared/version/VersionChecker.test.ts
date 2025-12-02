import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VersionChecker,
  initializeVersionChecker,
  getVersionChecker,
  destroyVersionChecker,
} from './VersionChecker.js';

// Mock loggers
vi.mock('../logger/structured-logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../logger/mcp-logger.js', () => ({
  getMCPLogger: vi.fn(() => ({
    notice: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('VersionChecker', () => {
  let checker: VersionChecker;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    destroyVersionChecker();
  });

  afterEach(() => {
    checker?.destroy();
    vi.useRealTimers();
  });

  describe('version parsing and comparison', () => {
    it('should detect update when newer version available', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: 'v0.3.0',
            html_url: 'https://github.com/test/repo/releases/v0.3.0',
            name: 'Release v0.3.0',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();

      expect(result).not.toBeNull();
      expect(result?.latestVersion).toBe('0.3.0');
      expect(result?.updateAvailable).toBe(true);
    });

    it('should not detect update when on latest version', async () => {
      checker = new VersionChecker({
        currentVersion: '0.3.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: 'v0.3.0',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();

      expect(result?.updateAvailable).toBe(false);
    });

    it('should handle v-prefix in version tags', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: 'v0.3.0',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();

      expect(result?.latestVersion).toBe('0.3.0');
    });

    it('should detect stable as newer than prerelease', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0-beta',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: '0.2.0',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();

      expect(result?.updateAvailable).toBe(true);
    });

    it('should not detect prerelease as newer than stable', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: '0.2.0-beta',
            draft: false,
            prerelease: true,
          },
        ],
      });

      // Without includePrerelease, prereleases are filtered out
      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
    });
  });

  describe('version comparison edge cases', () => {
    const testCases = [
      { current: '0.2.0', latest: '0.3.0', expected: true },
      { current: '0.2.0', latest: '0.2.1', expected: true },
      { current: '0.2.0', latest: '1.0.0', expected: true },
      { current: '0.2.0', latest: '0.2.0', expected: false },
      { current: '0.3.0', latest: '0.2.0', expected: false },
      { current: '1.0.0', latest: '0.9.9', expected: false },
      { current: '0.2.0-alpha', latest: '0.2.0-beta', expected: true },
    ];

    testCases.forEach(({ current, latest, expected }) => {
      it(`should ${expected ? 'detect' : 'not detect'} update from ${current} to ${latest}`, async () => {
        checker = new VersionChecker({
          currentVersion: current,
          repository: 'test/repo',
          checkOnInit: false,
          includePrerelease: true,
        });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              tag_name: latest,
              draft: false,
              prerelease: latest.includes('-'),
            },
          ],
        });

        const result = await checker.checkForUpdates();

        expect(result?.updateAvailable).toBe(expected);
      });
    });
  });

  describe('network error handling', () => {
    it('should silently handle network errors', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
    });

    it('should handle API rate limiting (403)', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
    });

    it('should handle empty releases list', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
    });
  });

  describe('release filtering', () => {
    it('should filter out draft releases', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: '0.5.0',
            draft: true,
            prerelease: false,
          },
          {
            tag_name: '0.3.0',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();

      expect(result?.latestVersion).toBe('0.3.0');
    });

    it('should filter out prereleases by default', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
        includePrerelease: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: '0.5.0-beta',
            draft: false,
            prerelease: true,
          },
          {
            tag_name: '0.3.0',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();

      expect(result?.latestVersion).toBe('0.3.0');
    });

    it('should include prereleases when configured', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
        includePrerelease: true,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: '0.5.0-beta',
            draft: false,
            prerelease: true,
          },
          {
            tag_name: '0.3.0',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();

      expect(result?.latestVersion).toBe('0.5.0-beta');
    });
  });

  describe('periodic checks', () => {
    it('should schedule periodic checks', async () => {
      const checkInterval = 1000;

      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
        checkIntervalMs: checkInterval,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ tag_name: '0.2.0', draft: false, prerelease: false }],
      });

      await checker.start();

      // Advance time and verify that checks are being made
      vi.advanceTimersByTime(checkInterval);
      await vi.runOnlyPendingTimersAsync();

      const callsAfterFirstInterval = mockFetch.mock.calls.length;
      expect(callsAfterFirstInterval).toBeGreaterThan(0);

      vi.advanceTimersByTime(checkInterval);
      await vi.runOnlyPendingTimersAsync();

      // Should have more calls after second interval
      expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterFirstInterval);
    });

    it('should perform initial check when configured', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: true,
        checkIntervalMs: 100000,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ tag_name: '0.2.0', draft: false, prerelease: false }],
      });

      await checker.start();
      await vi.runOnlyPendingTimersAsync();

      // Should have been called at least once for the initial check
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('should stop checks after destroy', async () => {
      const checkInterval = 1000;

      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
        checkIntervalMs: checkInterval,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => [{ tag_name: '0.2.0', draft: false, prerelease: false }],
      });

      await checker.start();
      checker.destroy();

      vi.advanceTimersByTime(checkInterval * 5);
      await vi.runOnlyPendingTimersAsync();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip check if destroyed', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      checker.destroy();

      const result = await checker.checkForUpdates();

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('singleton functions', () => {
    it('should return null before initialization', () => {
      expect(getVersionChecker()).toBeNull();
    });

    it('should return instance after initialization', () => {
      const instance = initializeVersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      expect(getVersionChecker()).toBe(instance);
    });

    it('should destroy instance correctly', () => {
      initializeVersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      destroyVersionChecker();

      expect(getVersionChecker()).toBeNull();
    });
  });

  describe('last check result', () => {
    it('should store last check result', async () => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: '0.3.0',
            html_url: 'https://github.com/test/repo/releases/v0.3.0',
            name: 'Release v0.3.0',
            draft: false,
            prerelease: false,
          },
        ],
      });

      expect(checker.getLastCheckResult()).toBeUndefined();

      await checker.checkForUpdates();

      const result = checker.getLastCheckResult();
      expect(result).toBeDefined();
      expect(result?.latestVersion).toBe('0.3.0');
      expect(result?.updateAvailable).toBe(true);
      expect(result?.releaseUrl).toBe('https://github.com/test/repo/releases/v0.3.0');
      expect(result?.checkedAt).toBeInstanceOf(Date);
    });
  });
});
