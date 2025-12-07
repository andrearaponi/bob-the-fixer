/**
 * Version checking types and interfaces
 */

/**
 * Update type classification for releases
 */
export type UpdateType = 'core' | 'infra' | 'full';

/**
 * Release metadata embedded in GitHub release body
 */
export interface ReleaseMetadata {
  /** Type of update required */
  updateType: UpdateType;
  /** Minimum version that can safely update to this release */
  minVersion?: string;
  /** Whether this release contains breaking changes */
  breakingChanges?: boolean;
  /** Short notes to display in update banner */
  notes?: string;
  /** List of actions required after update (for full updates) */
  requiredActions?: string[];
}

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
  /** Release body containing notes and metadata */
  body: string;
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
  /** Type of update (core, infra, or full) */
  updateType: UpdateType;
  /** Parsed release metadata (if available) */
  metadata?: ReleaseMetadata;
  /** Suggested command to run for update */
  updateCommand: string;
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
