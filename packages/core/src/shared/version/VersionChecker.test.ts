import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VersionChecker,
  initializeVersionChecker,
  getVersionChecker,
  destroyVersionChecker,
} from './VersionChecker.js';
import type { UpdateType, ReleaseMetadata } from './types.js';

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

  describe('release metadata types', () => {
    it('should accept valid update types', () => {
      const types: UpdateType[] = ['core', 'infra', 'full'];
      expect(types).toHaveLength(3);
      expect(types).toContain('core');
      expect(types).toContain('infra');
      expect(types).toContain('full');
    });

    it('should create valid ReleaseMetadata with required field only', () => {
      const metadata: ReleaseMetadata = { updateType: 'core' };
      expect(metadata.updateType).toBe('core');
    });

    it('should create valid ReleaseMetadata with all optional fields', () => {
      const metadata: ReleaseMetadata = {
        updateType: 'full',
        minVersion: '0.3.0',
        breakingChanges: true,
        notes: 'Test notes',
        requiredActions: ['Backup .env', 'Re-register MCP'],
      };
      expect(metadata.updateType).toBe('full');
      expect(metadata.minVersion).toBe('0.3.0');
      expect(metadata.breakingChanges).toBe(true);
      expect(metadata.notes).toBe('Test notes');
      expect(metadata.requiredActions).toHaveLength(2);
    });
  });

  describe('metadata parsing', () => {
    beforeEach(() => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });
    });

    it('should parse valid metadata from release body', () => {
      const body = `
## What's New
- Feature X

<!-- BOB_RELEASE_METADATA
{
  "updateType": "core",
  "notes": "Bug fixes"
}
-->
`;
      const result = checker.parseReleaseMetadata(body);
      expect(result).toEqual({
        updateType: 'core',
        notes: 'Bug fixes',
      });
    });

    it('should return null for body without metadata', () => {
      const body = '## Release notes\nJust text without metadata';
      const result = checker.parseReleaseMetadata(body);
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const body = '<!-- BOB_RELEASE_METADATA\n{invalid json here}\n-->';
      const result = checker.parseReleaseMetadata(body);
      expect(result).toBeNull();
    });

    it('should return null for invalid updateType', () => {
      const body = '<!-- BOB_RELEASE_METADATA\n{"updateType": "invalid"}\n-->';
      const result = checker.parseReleaseMetadata(body);
      expect(result).toBeNull();
    });

    it('should return null for missing updateType', () => {
      const body = '<!-- BOB_RELEASE_METADATA\n{"notes": "No updateType"}\n-->';
      const result = checker.parseReleaseMetadata(body);
      expect(result).toBeNull();
    });

    it('should parse metadata with all optional fields', () => {
      const body = `<!-- BOB_RELEASE_METADATA
{
  "updateType": "full",
  "minVersion": "0.3.0",
  "breakingChanges": true,
  "notes": "Breaking change",
  "requiredActions": ["Backup .env"]
}
-->`;
      const result = checker.parseReleaseMetadata(body);
      expect(result).not.toBeNull();
      expect(result?.updateType).toBe('full');
      expect(result?.minVersion).toBe('0.3.0');
      expect(result?.breakingChanges).toBe(true);
      expect(result?.notes).toBe('Breaking change');
      expect(result?.requiredActions).toEqual(['Backup .env']);
    });

    it('should handle metadata at end of body', () => {
      const body = `## Release Notes
Some text here

<!-- BOB_RELEASE_METADATA
{"updateType": "infra", "notes": "Container update"}
-->`;
      const result = checker.parseReleaseMetadata(body);
      expect(result?.updateType).toBe('infra');
    });

    it('should handle null body', () => {
      const result = checker.parseReleaseMetadata(null as unknown as string);
      expect(result).toBeNull();
    });
  });

  describe('update type detection', () => {
    beforeEach(() => {
      checker = new VersionChecker({
        currentVersion: '0.2.0',
        repository: 'test/repo',
        checkOnInit: false,
      });
    });

    it('should default to "full" when no metadata present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: '0.3.0',
            html_url: 'https://github.com/test/repo/releases/v0.3.0',
            name: 'Release v0.3.0',
            body: '## Release notes\nNo metadata here',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();
      expect(result?.updateType).toBe('full');
    });

    it('should use metadata updateType when present', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: '0.3.0',
            html_url: 'https://github.com/test/repo/releases/v0.3.0',
            name: 'Release v0.3.0',
            body: '<!-- BOB_RELEASE_METADATA\n{"updateType": "core", "notes": "Quick fix"}\n-->',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();
      expect(result?.updateType).toBe('core');
      expect(result?.metadata?.notes).toBe('Quick fix');
    });

    it('should include updateCommand in result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            tag_name: '0.3.0',
            body: '<!-- BOB_RELEASE_METADATA\n{"updateType": "core"}\n-->',
            draft: false,
            prerelease: false,
          },
        ],
      });

      const result = await checker.checkForUpdates();
      expect(result?.updateCommand).toBe('./update.sh');
    });

    it('should generate correct update command for each type', () => {
      expect(checker.generateUpdateCommand('core')).toBe('./update.sh');
      expect(checker.generateUpdateCommand('infra')).toBe('./update.sh');
      expect(checker.generateUpdateCommand('full')).toBe('./update.sh');
    });
  });

  describe('banner generation with metadata', () => {
    it('should include update type description for core update', async () => {
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
            body: '<!-- BOB_RELEASE_METADATA\n{"updateType": "core"}\n-->',
            draft: false,
            prerelease: false,
          },
        ],
      });

      await checker.checkForUpdates();
      const banner = checker.getUpdateBannerOnce();

      expect(banner).toContain('(Code update only)');
      expect(banner).toContain('Run: ./update.sh');
    });

    it('should include update type description for infra update', async () => {
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
            body: '<!-- BOB_RELEASE_METADATA\n{"updateType": "infra"}\n-->',
            draft: false,
            prerelease: false,
          },
        ],
      });

      await checker.checkForUpdates();
      const banner = checker.getUpdateBannerOnce();

      expect(banner).toContain('(Includes container changes)');
    });

    it('should include update type description for full update', async () => {
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
            body: '<!-- BOB_RELEASE_METADATA\n{"updateType": "full"}\n-->',
            draft: false,
            prerelease: false,
          },
        ],
      });

      await checker.checkForUpdates();
      const banner = checker.getUpdateBannerOnce();

      expect(banner).toContain('(Breaking changes - see release notes)');
    });

    it('should include notes in banner when available', async () => {
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
            body: '<!-- BOB_RELEASE_METADATA\n{"updateType": "core", "notes": "Performance improvements"}\n-->',
            draft: false,
            prerelease: false,
          },
        ],
      });

      await checker.checkForUpdates();
      const banner = checker.getUpdateBannerOnce();

      expect(banner).toContain('Notes: Performance improvements');
    });

    it('should not include notes line when notes not available', async () => {
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
            body: '<!-- BOB_RELEASE_METADATA\n{"updateType": "core"}\n-->',
            draft: false,
            prerelease: false,
          },
        ],
      });

      await checker.checkForUpdates();
      const banner = checker.getUpdateBannerOnce();

      expect(banner).not.toContain('Notes:');
    });

    it('should default to full update type when no metadata', async () => {
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
            body: '## Release Notes\nNo metadata',
            draft: false,
            prerelease: false,
          },
        ],
      });

      await checker.checkForUpdates();
      const banner = checker.getUpdateBannerOnce();

      expect(banner).toContain('(Breaking changes - see release notes)');
      expect(banner).toContain('Run: ./update.sh');
    });
  });
});
