/**
 * Project Manager Interface
 *
 * Defines the contract for managing project configurations.
 * Implementations handle local config files, environment variables, and project detection.
 */

export interface ProjectConfig {
  sonarUrl: string;
  sonarToken: string;
  sonarProjectKey: string;
  createdAt: string;
  language?: string;
  framework?: string;
  logLevel?: string;
  forceCliScanner?: boolean;
}

export interface ProjectContext {
  path: string;
  name: string;
  language: string[];
  framework?: string;
  buildTool?: string;
  packageManager?: string;
}

/**
 * Project Manager interface for DI
 */
export interface IProjectManager {
  /**
   * Get or create configuration for current project
   */
  getOrCreateConfig(): Promise<ProjectConfig>;

  /**
   * Ensures environment variables are synced to local config file
   */
  ensureConfigSync(): Promise<void>;

  /**
   * Analyze current project to determine language, framework, etc.
   */
  analyzeProject(): Promise<ProjectContext>;

  /**
   * Get current working directory
   */
  getWorkingDirectory(): string;

  /**
   * Set working directory
   */
  setWorkingDirectory(dir: string): void;
}
