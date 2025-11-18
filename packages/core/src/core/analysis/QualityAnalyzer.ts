/**
 * QualityAnalyzer Service
 * Analyzes quality gates, metrics, technical debt, and code duplication
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarQubeClient } from '../../sonar/index.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import {
  buildMetricsMap,
  buildProjectMetricsReport
} from '../../reports/project-metrics-report.js';
import {
  buildDebtOverview,
  buildDebtBreakdown,
  buildBudgetAnalysis,
  buildRecommendationsSection,
  buildROIAnalysis
} from '../../reports/technical-debt-report.js';

export interface ProjectMetricsOptions {
  metrics?: string[];
}

export interface TechnicalDebtOptions {
  includeBudgetAnalysis?: boolean;
}

export interface DuplicationSummaryOptions {
  sortBy?: 'density' | 'lines' | 'blocks';
  maxResults?: number;
  pageSize?: number;
}

export class QualityAnalyzer {
  private readonly logger: StructuredLogger;

  constructor(private readonly projectManager: ProjectManager) {
    this.logger = getLogger();
  }

  /**
   * Get quality gate status
   */
  async getQualityGate(correlationId?: string): Promise<string> {
    this.logger.info('Getting quality gate status', {}, correlationId);

    const config = await this.projectManager.getOrCreateConfig();
    const projectContext = await this.projectManager.analyzeProject();
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    // Fetch quality gate status from SonarQube API
    const qgStatus = await sonarClient.getQualityGateStatus();

    // Build readable report
    let report = `QUALITY GATE STATUS\n\n`;

    // Status icon and message
    const statusIcon = qgStatus.status === 'OK' ? '✅' : qgStatus.status === 'WARN' ? '⚠️' : '❌';
    const statusText = qgStatus.status === 'OK' ? 'PASSED' : qgStatus.status === 'WARN' ? 'WARNING' : 'FAILED';
    report += `Status: ${statusIcon} **${statusText}**\n\n`;

    // Conditions
    if (qgStatus.conditions && qgStatus.conditions.length > 0) {
      report += `CONDITIONS:\n\n`;
      qgStatus.conditions.forEach((condition: any) => {
        const condIcon = condition.status === 'OK' ? '✓' : condition.status === 'WARN' ? '⚠' : '✗';
        report += `${condIcon} **${condition.metricKey}**\n`;
        report += `  - Comparator: ${condition.comparator}\n`;
        report += `  - Actual Value: ${condition.actualValue}\n`;
        if (condition.errorThreshold) report += `  - Error Threshold: ${condition.errorThreshold}\n`;
        if (condition.warningThreshold) report += `  - Warning Threshold: ${condition.warningThreshold}\n`;
        report += `  - Status: ${condition.status}\n\n`;
      });
    }

    // Period information
    if (qgStatus.period) {
      report += `PERIOD:\n\n`;
      report += `- Mode: ${qgStatus.period.mode}\n`;
      report += `- Date: ${qgStatus.period.date}\n`;
      if (qgStatus.period.parameter) report += `- Parameter: ${qgStatus.period.parameter}\n`;
      report += `\n`;
    }

    // CAYC Status if available
    if (qgStatus.caycStatus) {
      report += `Clean as You Code Status: ${qgStatus.caycStatus}\n\n`;
    }

    return report;
  }

  /**
   * Get project metrics
   */
  async getProjectMetrics(
    options: ProjectMetricsOptions,
    correlationId?: string
  ): Promise<string> {
    this.logger.info('Getting project metrics', { options }, correlationId);

    const config = await this.projectManager.getOrCreateConfig();
    const projectKey = config.sonarProjectKey;

    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      projectKey
    );

    const projectMetrics = await sonarClient.getProjectMetrics(options.metrics);

    // Convert measures array to map for easier access
    const metricsMap = buildMetricsMap(projectMetrics.component.measures);

    // Build report using Builder pattern
    const report = buildProjectMetricsReport(
      projectKey,
      projectMetrics.component.name,
      metricsMap
    );

    return report;
  }

  /**
   * Get technical debt analysis
   */
  async getTechnicalDebt(
    options: TechnicalDebtOptions,
    correlationId?: string
  ): Promise<string> {
    this.logger.info('Getting technical debt', { options }, correlationId);

    const config = await this.projectManager.getOrCreateConfig();
    const projectContext = await this.projectManager.analyzeProject();

    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    const analysis = await sonarClient.getTechnicalDebtAnalysis();

    let report = `TECHNICAL DEBT ANALYSIS\n\n`;
    report += buildDebtOverview(analysis);
    report += buildDebtBreakdown(analysis);
    report += buildBudgetAnalysis(analysis, options.includeBudgetAnalysis !== false);
    report += buildRecommendationsSection(analysis);
    report += buildROIAnalysis(analysis);

    return report;
  }

  /**
   * Get duplication summary
   */
  async getDuplicationSummary(
    options: DuplicationSummaryOptions,
    correlationId?: string
  ): Promise<string> {
    this.logger.info('Getting duplication summary', { options }, correlationId);

    const config = await this.projectManager.getOrCreateConfig();
    const projectContext = await this.projectManager.analyzeProject();

    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    const summary = await sonarClient.getDuplicationSummary();

    let report = `CODE DUPLICATION SUMMARY\n\n`;

    // Overall statistics
    report += `OVERVIEW:\n`;
    report += `- Files with duplication: ${summary.totalFiles}\n`;
    report += `- Total duplicated lines: ${summary.duplicatedLines}\n`;
    report += `- Total duplicated blocks: ${summary.duplicatedBlocks}\n\n`;

    // Files with highest duplication
    if (summary.filesWithDuplication.components.length > 0) {
      const sortBy = options.sortBy || 'density';
      const maxResults = options.maxResults || 10;

      let sortDescription: string;
      if (sortBy === 'lines') {
        sortDescription = 'duplicated lines';
      } else if (sortBy === 'blocks') {
        sortDescription = 'duplicated blocks';
      } else {
        sortDescription = 'duplication density';
      }
      report += `FILES WITH DUPLICATION (sorted by ${sortDescription}, showing top ${maxResults}):\n`;

      // Sort files based on user preference
      const sortedFiles = summary.filesWithDuplication.components
        .filter(file => file.measures && file.measures.length > 0)
        .sort((a, b) => {
          let aValue = 0;
          let bValue = 0;

          switch (sortBy) {
            case 'lines':
              aValue = parseFloat(a.measures?.find(m => m.metric === 'duplicated_lines')?.value ?? '0');
              bValue = parseFloat(b.measures?.find(m => m.metric === 'duplicated_lines')?.value ?? '0');
              break;
            case 'blocks':
              aValue = parseFloat(a.measures?.find(m => m.metric === 'duplicated_blocks')?.value ?? '0');
              bValue = parseFloat(b.measures?.find(m => m.metric === 'duplicated_blocks')?.value ?? '0');
              break;
            case 'density':
            default:
              aValue = parseFloat(a.measures?.find(m => m.metric === 'duplicated_lines_density')?.value ?? '0');
              bValue = parseFloat(b.measures?.find(m => m.metric === 'duplicated_lines_density')?.value ?? '0');
              break;
          }

          return bValue - aValue; // Highest first
        })
        .slice(0, maxResults); // Show requested number

      sortedFiles.forEach((file, index) => {
        const densityMeasure = file.measures?.find(m => m.metric === 'duplicated_lines_density');
        const linesMeasure = file.measures?.find(m => m.metric === 'duplicated_lines');
        const blocksMeasure = file.measures?.find(m => m.metric === 'duplicated_blocks');

        report += `  ${index + 1}. ${file.path}\n`;

        // Show all available metrics with priority indicator
        if (densityMeasure) {
          const density = parseFloat(densityMeasure.value);
          let priority: string;
          if (density > 50) {
            priority = '🔴';
          } else if (density > 20) {
            priority = '🟡';
          } else {
            priority = '🟢';
          }
          report += `    ${priority} Duplication: ${densityMeasure.value}%\n`;
        }
        if (linesMeasure) {
          report += `    📏 Duplicated lines: ${linesMeasure.value}\n`;
        }
        if (blocksMeasure) {
          report += `    📦 Duplicated blocks: ${blocksMeasure.value}\n`;
        }
        report += `    🔑 Key: ${file.key}\n\n`;
      });
    }

    // Recommendations
    if (summary.recommendations.length > 0) {
      report += `RECOMMENDATIONS:\n`;
      summary.recommendations.forEach(rec => {
        report += `${rec}\n`;
      });
    }

    return report;
  }
}
