/**
 * Version checking types and interfaces
 */

/**
 * GitHub Release API response structure (partial)
 */
export interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

/**
 * Parsed semantic version
 */
export interface SemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

/**
 * Version check result
 */
export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl?: string;
  releaseName?: string;
  checkedAt: Date;
}

/**
 * Configuration for VersionChecker
 */
export interface VersionCheckerConfig {
  /** Current version of the application */
  currentVersion: string;
  /** GitHub repository in format "owner/repo" */
  repository: string;
  /** Check interval in milliseconds (default: 24 hours) */
  checkIntervalMs?: number;
  /** Whether to check immediately on initialization */
  checkOnInit?: boolean;
  /** Whether to include pre-releases in checks */
  includePrerelease?: boolean;
}
