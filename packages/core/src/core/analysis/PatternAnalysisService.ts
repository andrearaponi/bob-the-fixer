/**
 * PatternAnalysisService
 * Analyzes patterns in SonarQube issues and provides actionable insights
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarQubeClient, PatternAnalyzer } from '../../sonar/index.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import { buildPatternAnalysisReport } from '../../reports/pattern-analysis-report.js';

export interface PatternAnalysisOptions {
  groupBy?: 'pattern' | 'file' | 'severity' | 'fixability';
  includeImpact?: boolean;
  includeCorrelations?: boolean;
}

export interface PatternAnalysisResult {
  totalIssues: number;
  groupedAnalysis: any;
  hasIssues: boolean;
  report: string;
}

export class PatternAnalysisService {
  private readonly logger: StructuredLogger;

  constructor(private readonly projectManager: ProjectManager) {
    this.logger = getLogger();
  }

  /**
   * Analyze patterns in project issues
   */
  async analyze(
    options: PatternAnalysisOptions,
    correlationId?: string
  ): Promise<PatternAnalysisResult> {
    this.logger.info('Starting pattern analysis', { options }, correlationId);

    // Get configuration and create client
    const config = await this.projectManager.getOrCreateConfig();
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey
    );

    // Get all issues
    const issues = await sonarClient.getIssues();

    if (issues.length === 0) {
      this.logger.info('No issues found for pattern analysis', {}, correlationId);
      return {
        totalIssues: 0,
        groupedAnalysis: null,
        hasIssues: false,
        report: this.formatNoIssuesReport()
      };
    }

    // Fetch rule details dynamically
    const ruleCache = await sonarClient.getUniqueRulesInfo(issues);

    // Analyze patterns
    const groupBy = options.groupBy || 'pattern';
    const analysis = PatternAnalyzer.analyze(
      issues,
      ruleCache,
      groupBy
    );

    // Format the report
    const report = buildPatternAnalysisReport(
      analysis,
      options.includeImpact !== false
    );

    this.logger.info('Pattern analysis completed', {
      totalIssues: issues.length,
      groupBy
    }, correlationId);

    return {
      totalIssues: issues.length,
      groupedAnalysis: analysis,
      hasIssues: true,
      report
    };
  }

  /**
   * Format report for no issues case
   */
  private formatNoIssuesReport(): string {
    return '📊 Pattern Analysis\n\n' +
           'No issues found in the project. Great work maintaining code quality!';
  }
}
