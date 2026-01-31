/**
 * SonarQube Admin Interface
 *
 * Defines the contract for SonarQube administrative operations.
 * Handles project creation, token management, and quality gate configuration.
 */

import { ProjectContext } from './IProjectManager.js';

export interface SonarProjectInfo {
  key: string;
  name: string;
  qualifier: string;
  visibility: string;
}

export interface SonarTokenInfo {
  name: string;
  token: string;
  type: string;
  createdAt: string;
  expirationDate?: string;
}

export interface QualityGateTemplate {
  name: string;
  conditions: Array<{
    metric: string;
    op: string;
    error: string;
  }>;
}

export interface ProjectSetupResult {
  project: SonarProjectInfo;
  token: SonarTokenInfo;
  qualityGate: QualityGateTemplate;
}

export interface CleanupResult {
  deletedProjects: string[];
  revokedTokens: string[];
}

/**
 * Project details from SonarQube
 */
export interface SonarProjectDetails {
  key: string;
  name: string;
  lastAnalysisDate?: string;
  visibility: string;
}

/**
 * SonarQube Admin interface for DI
 */
export interface ISonarAdmin {
  /**
   * Check if SonarQube server is accessible and token is valid
   */
  validateConnection(): Promise<boolean>;

  /**
   * Get project details from SonarQube
   */
  getProjectDetails(projectKey: string): Promise<SonarProjectDetails | null>;

  /**
   * Check if project exists
   */
  projectExists(projectKey: string): Promise<boolean>;

  /**
   * Create new SonarQube project
   */
  createProject(
    projectKey: string,
    projectName: string,
    visibility?: 'public' | 'private'
  ): Promise<SonarProjectInfo>;

  /**
   * Generate user token for project
   */
  generateToken(
    tokenName: string,
    projectKey?: string,
    type?: 'USER_TOKEN' | 'PROJECT_ANALYSIS_TOKEN'
  ): Promise<SonarTokenInfo>;

  /**
   * List existing tokens
   */
  listTokens(): Promise<SonarTokenInfo[]>;

  /**
   * Revoke token
   */
  revokeToken(tokenName: string): Promise<boolean>;

  /**
   * Delete project
   */
  deleteProject(projectKey: string): Promise<boolean>;

  /**
   * Get quality gate templates based on project context
   */
  getQualityGateTemplate(context: ProjectContext): QualityGateTemplate;

  /**
   * Apply quality gate to project
   */
  applyQualityGate(projectKey: string, template: QualityGateTemplate): Promise<boolean>;

  /**
   * Setup complete project with token and quality gate
   */
  setupProject(context: ProjectContext): Promise<ProjectSetupResult>;

  /**
   * Cleanup old projects and tokens
   */
  cleanup(olderThanDays?: number): Promise<CleanupResult>;
}
