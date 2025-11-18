/**
 * IssueAnalyzer Service
 * Analyzes and provides detailed information about SonarQube issues
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarQubeClient } from '../../sonar/index.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import {
  buildIssueDetailsReport,
  buildIssueBasicInfo,
  buildIssueLocation,
  buildRuleInformation,
  buildSourceContext,
  buildFileMetrics,
  buildAdditionalFields,
  buildNextSteps} from '../../shared/utils/issue-details-utils.js';

export interface IssueDetailsOptions {
  issueKey: string;
  contextLines?: number;
  includeRuleDetails?: boolean;
  includeCodeExamples?: boolean;
  includeFilePath?: boolean;
}

export interface IssueDetails {
  key: string;
  severity: string;
  type: string;
  message: string;
  component: string;
  line?: number;
  status: string;
  author?: string;
  rule: string;
  effort?: string;
  creationDate: string;
  updateDate?: string;
  tags?: string[];
  ruleDetails?: any;
  sourceContext?: string;
  filePath?: string;
}

export class IssueAnalyzer {
  private readonly logger: StructuredLogger;

  constructor(private readonly projectManager: ProjectManager) {
    this.logger = getLogger();
  }

  /**
   * Get detailed information about a specific issue
   */
  async getIssueDetails(
    options: IssueDetailsOptions,
    correlationId?: string
  ): Promise<string> {
    this.logger.info('Getting issue details', { issueKey: options.issueKey }, correlationId);

    // Get configuration and create client
    const config = await this.projectManager.getOrCreateConfig();
    const projectContext = await this.projectManager.analyzeProject();
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    // Find the issue
    const issues = await sonarClient.getIssues();
    const issue = issues.find(i => i.key === options.issueKey);

    if (!issue) {
      throw new Error(`Issue ${options.issueKey} not found`);
    }

    // Get extended source context
    const contextLines = options.contextLines ?? 10;
    const context = await sonarClient.getSourceContext(
      issue.component,
      Math.max(1, (issue.line ?? 1) - contextLines),
      (issue.line ?? 1) + contextLines
    );

    // Get file/component details for metrics
    let componentDetails: any = null;
    try {
      componentDetails = await sonarClient.getComponentDetails(issue.component);
    } catch (error: any) {
      // Component details are optional, don't fail if not available
      this.logger.debug('Could not fetch component details', { component: issue.component });
    }

    // Build comprehensive issue details using extracted utility functions
    const report = await buildIssueDetailsReport(
      issue,
      context,
      { ...config, projectManager: this.projectManager },
      sonarClient,
      {
        includeRuleDetails: options.includeRuleDetails ?? true,
        includeFilePath: options.includeFilePath ?? true,
        contextLines,
        componentDetails
      },
      buildIssueBasicInfo,
      buildIssueLocation,
      buildFileMetrics,
      buildRuleInformation,
      buildSourceContext,
      buildAdditionalFields,
      buildNextSteps
    );

    this.logger.info('Issue details retrieved', { issueKey: options.issueKey }, correlationId);

    return report;
  }
}
