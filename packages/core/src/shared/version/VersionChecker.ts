/**
 * Version checker service for Bob the Fixer
 * Checks GitHub Releases API for new versions and notifies via MCP logging
 */

import { getLogger, StructuredLogger } from '../logger/structured-logger.js';
import { getMCPLogger, MCPLogger } from '../logger/mcp-logger.js';
import {
  VersionCheckerConfig,
  VersionCheckResult,
  GitHubRelease,
  SemanticVersion,
} from './types.js';

const DEFAULT_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const GITHUB_API_BASE = 'https://api.github.com';
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

export class VersionChecker {
  private readonly logger: StructuredLogger;
  private readonly mcpLogger: MCPLogger;
  private readonly config: Required<VersionCheckerConfig>;
  private checkTimer?: ReturnType<typeof setInterval>;
  private lastCheckResult?: VersionCheckResult;
  private isDestroyed = false;
  private notificationShown = false;

  constructor(config: VersionCheckerConfig) {
    this.logger = getLogger();
    this.mcpLogger = getMCPLogger();

    this.config = {
      currentVersion: config.currentVersion,
      repository: config.repository,
      checkIntervalMs: config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS,
      checkOnInit: config.checkOnInit ?? true,
      includePrerelease: config.includePrerelease ?? false,
    };
  }

  /**
   * Start the version checker service
   * Performs initial check and schedules periodic checks
   */
  async start(): Promise<void> {
    this.logger.info('Starting version checker', {
      currentVersion: this.config.currentVersion,
      repository: this.config.repository,
      checkIntervalHours: this.config.checkIntervalMs / (60 * 60 * 1000),
    });

    // Perform initial check (non-blocking)
    if (this.config.checkOnInit) {
      this.checkForUpdates().catch(() => {
        // Silently ignore - logged internally
      });
    }

    // Schedule periodic checks
    this.startPeriodicCheck();
  }

  /**
   * Stop the version checker service
   */
  destroy(): void {
    this.isDestroyed = true;
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
    this.logger.debug('Version checker destroyed');
  }

  /**
   * Check for updates against GitHub Releases API
   */
  async checkForUpdates(): Promise<VersionCheckResult | null> {
    if (this.isDestroyed) {
      return null;
    }

    try {
      const latestRelease = await this.fetchLatestRelease();

      if (!latestRelease) {
        this.logger.debug('No releases found for repository');
        return null;
      }

      const latestVersion = this.normalizeVersion(latestRelease.tag_name);
      const currentVersion = this.normalizeVersion(this.config.currentVersion);

      const result: VersionCheckResult = {
        currentVersion: this.config.currentVersion,
        latestVersion,
        updateAvailable: this.isNewerVersion(latestVersion, currentVersion),
        releaseUrl: latestRelease.html_url,
        releaseName: latestRelease.name,
        checkedAt: new Date(),
      };

      this.lastCheckResult = result;

      if (result.updateAvailable) {
        this.notifyUpdateAvailable(result);
      } else {
        this.logger.debug('No update available', {
          currentVersion,
          latestVersion,
        });
      }

      return result;
    } catch (error) {
      // Silently ignore network errors (offline support)
      this.logger.debug('Version check failed (network error)', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get the last check result (if any)
   */
  getLastCheckResult(): VersionCheckResult | undefined {
    return this.lastCheckResult;
  }

  /**
   * Get update banner message (only returns once per session)
   * Returns null if no update available or already shown
   */
  getUpdateBannerOnce(): string | null {
    if (this.notificationShown) {
      return null;
    }

    if (!this.lastCheckResult?.updateAvailable) {
      return null;
    }

    this.notificationShown = true;
    const { latestVersion, currentVersion, releaseUrl } = this.lastCheckResult;

    return `\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `  UPDATE AVAILABLE: Bob the Fixer v${latestVersion}\n` +
      `  Current version: v${currentVersion}\n` +
      `  ${releaseUrl ?? 'https://github.com/andrearaponi/bob-the-fixer/releases'}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  }

  /**
   * Fetch the latest release from GitHub API
   */
  private async fetchLatestRelease(): Promise<GitHubRelease | null> {
    const url = `${GITHUB_API_BASE}/repos/${this.config.repository}/releases`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'bob-the-fixer-mcp-server',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const releases = (await response.json()) as GitHubRelease[];

    // Filter out drafts and optionally pre-releases
    const validReleases = releases.filter((release) => {
      if (release.draft) return false;
      if (!this.config.includePrerelease && release.prerelease) return false;
      return true;
    });

    if (validReleases.length === 0) {
      return null;
    }

    // Return the first (latest) valid release
    return validReleases[0];
  }

  /**
   * Start periodic version checks
   */
  private startPeriodicCheck(): void {
    this.checkTimer = setInterval(() => {
      if (!this.isDestroyed) {
        this.checkForUpdates().catch(() => {
          // Silently ignore - logged internally
        });
      }
    }, this.config.checkIntervalMs);

    // Don't keep process alive for version checks
    this.checkTimer.unref();
  }

  /**
   * Notify users about available update via MCP logging
   */
  private notifyUpdateAvailable(result: VersionCheckResult): void {
    const message = `A new version of Bob the Fixer is available: ${result.latestVersion} (current: ${result.currentVersion})`;

    // Log to structured logger (stderr)
    this.logger.info(message, {
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion,
      releaseUrl: result.releaseUrl,
    });

    // Send notification via MCP logging (visible to AI assistant)
    this.mcpLogger.notice('version', message, {
      currentVersion: result.currentVersion,
      latestVersion: result.latestVersion,
      releaseUrl: result.releaseUrl,
      releaseName: result.releaseName,
    });
  }

  /**
   * Normalize version string (remove 'v' prefix)
   */
  private normalizeVersion(version: string): string {
    return version.replace(/^v/i, '');
  }

  /**
   * Parse a semantic version string
   */
  private parseVersion(version: string): SemanticVersion | null {
    const normalized = this.normalizeVersion(version);
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(normalized);

    if (!match) {
      return null;
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4],
    };
  }

  /**
   * Compare two versions
   * Returns true if versionA is newer than versionB
   */
  private isNewerVersion(versionA: string, versionB: string): boolean {
    const a = this.parseVersion(versionA);
    const b = this.parseVersion(versionB);

    if (!a || !b) {
      // Fallback to string comparison if parsing fails
      return versionA > versionB;
    }

    // Compare major.minor.patch
    if (a.major !== b.major) return a.major > b.major;
    if (a.minor !== b.minor) return a.minor > b.minor;
    if (a.patch !== b.patch) return a.patch > b.patch;

    // Handle prerelease comparisons
    // No prerelease > any prerelease (1.0.0 > 1.0.0-beta)
    if (!a.prerelease && b.prerelease) return true;
    if (a.prerelease && !b.prerelease) return false;

    // Both have prerelease: string comparison
    if (a.prerelease && b.prerelease) {
      return a.prerelease > b.prerelease;
    }

    return false;
  }
}

// Singleton instance
let versionCheckerInstance: VersionChecker | null = null;

/**
 * Get the global version checker instance
 */
export function getVersionChecker(): VersionChecker | null {
  return versionCheckerInstance;
}

/**
 * Initialize the version checker with configuration
 */
export function initializeVersionChecker(
  config: VersionCheckerConfig
): VersionChecker {
  versionCheckerInstance = new VersionChecker(config);
  return versionCheckerInstance;
}

/**
 * Destroy the version checker instance
 */
export function destroyVersionChecker(): void {
  if (versionCheckerInstance) {
    versionCheckerInstance.destroy();
    versionCheckerInstance = null;
  }
}
