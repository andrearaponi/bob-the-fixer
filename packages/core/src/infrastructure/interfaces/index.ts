/**
 * Infrastructure Interfaces Module
 *
 * Exports all infrastructure interfaces for dependency injection.
 */

export type {
  IProjectManager,
  ProjectConfig,
  ProjectContext,
} from './IProjectManager.js';

export type {
  ISonarAdmin,
  SonarProjectInfo,
  SonarTokenInfo,
  QualityGateTemplate,
  ProjectSetupResult,
  CleanupResult,
} from './ISonarAdmin.js';
