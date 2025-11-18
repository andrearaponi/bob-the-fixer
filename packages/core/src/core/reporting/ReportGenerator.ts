/**
 * ReportGenerator Service
 * Generates comprehensive quality reports in various formats
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarQubeClient } from '../../sonar/index.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import {
  ReportData,
  groupBy
} from '../../reports/comprehensive-report.js';
import {
  buildMetricsMap} from '../../reports/project-metrics-report.js';
import {
  calculateQualityScore,
  getSeverityWeight
} from '../../shared/utils/server-utils.js';
import {
  getSeverityIcon,
  getIssueTypeIcon
} from '../../shared/utils/issue-details-utils.js';
import { getReportFormatter } from '../../reports/report-utils.js';

export interface ReportGeneratorOptions {
  format?: 'summary' | 'detailed' | 'json';
}

export class ReportGenerator {
  private readonly logger: StructuredLogger;

  constructor(private readonly projectManager: ProjectManager) {
    this.logger = getLogger();
  }

  /**
   * Generate comprehensive report
   */
  async generateReport(
    options: ReportGeneratorOptions,
    correlationId?: string
  ): Promise<string> {
    this.logger.info('Generating report', { format: options.format }, correlationId);

    const config = await this.projectManager.getOrCreateConfig();
    const projectContext = await this.projectManager.analyzeProject();
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    const format = options.format || 'summary';

    // Fetch data from SonarQube
    const [issues, hotspots, projectMetrics] = await Promise.all([
      sonarClient.getIssues(),
      sonarClient.getSecurityHotspots({ statuses: ['TO_REVIEW'] as any }),
      sonarClient.getProjectMetrics()
    ]);

    // Prepare report data
    const reportData: ReportData = {
      config,
      issues,
      hotspots,
      projectMetrics,
      bySeverity: groupBy(issues, 'severity'),
      byType: groupBy(issues, 'type'),
      qualityScore: calculateQualityScore(issues),
      metricsMap: buildMetricsMap(projectMetrics.component.measures)
    };

    // Select formatter based on format type
    const formatter = getReportFormatter(
      format,
      getSeverityIcon,
      getIssueTypeIcon,
      getSeverityWeight
    );
    const report = formatter.format(reportData);

    return report;
  }
}
