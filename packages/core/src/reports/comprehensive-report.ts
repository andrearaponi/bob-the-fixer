import { MetricsMap } from './project-metrics-report.js';

// Utility function for grouping items by a key
export function groupBy(items: any[], key: string): any {
  return items.reduce((acc, item) => {
    const value = item[key];
    acc[value] ??= [];
    acc[value].push(item);
    return acc;
  }, {});
}

export interface ReportData {
  config: any;
  issues: any[];
  hotspots: any[];
  projectMetrics: any;
  bySeverity: any;
  byType: any;
  qualityScore: number;
  metricsMap: MetricsMap;
}

export interface ReportFormatter {
  format(data: ReportData): string;
}

export class JsonReportFormatter implements ReportFormatter {
  format(data: ReportData): string {
    return JSON.stringify({
      totalIssues: data.issues.length,
      bySeverity: data.bySeverity,
      byType: data.byType,
      qualityScore: data.qualityScore,
      securityHotspots: {
        total: data.hotspots.length,
        byStatus: groupBy(data.hotspots, 'status'),
        byProbability: groupBy(data.hotspots, 'vulnerabilityProbability')
      },
      duplication: {
        percentage: data.metricsMap.duplicated_lines_density?.value ?? '0',
        duplicatedLines: data.metricsMap.duplicated_lines?.value ?? '0',
        duplicatedBlocks: data.metricsMap.duplicated_blocks?.value ?? '0'
      },
      coverage: data.metricsMap.coverage?.value ?? '0',
      qualityGate: data.metricsMap.alert_status?.value ?? 'UNKNOWN',
      timestamp: new Date().toISOString()
    }, null, 2);
  }
}

export class TextReportFormatter implements ReportFormatter {
  constructor(
    private readonly getSeverityIcon: (severity: string) => string,
    private readonly getIssueTypeIcon: (type: string) => string,
    private readonly getSeverityWeight: (severity: string) => number
  ) {}

  format(data: ReportData): string {
    let report = '';
    report += this.buildHeader(data);
    report += this.buildQualityGateSection(data);
    report += this.buildOverviewSection(data);
    report += this.buildIssuesBreakdown(data);
    report += this.buildSecurityHotspotsSection(data);
    report += this.buildDuplicationSection(data);
    report += this.buildCodeMetricsSection(data);
    report += this.buildTopIssuesSection(data);
    report += this.buildRecommendationsSection(data);
    return report;
  }

  private buildHeader(data: ReportData): string {
    let section = `SONARGUARD COMPREHENSIVE QUALITY REPORT\n\n`;
    section += `Generated: ${new Date().toLocaleString()}\n`;
    section += `Project: ${data.config.sonarProjectKey}\n`;
    section += `Component: ${data.projectMetrics.component.name}\n\n`;
    return section;
  }

  private buildQualityGateSection(data: ReportData): string {
    const alertStatus = data.metricsMap.alert_status?.value ?? 'UNKNOWN';
    let statusEmoji: string;
    if (alertStatus === 'OK') {
      statusEmoji = '✅';
    } else if (alertStatus === 'ERROR') {
      statusEmoji = '❌';
    } else {
      statusEmoji = '⚠️';
    }
    return `QUALITY GATE STATUS: ${statusEmoji} ${alertStatus}\n\n`;
  }

  private buildOverviewSection(data: ReportData): string {
    let section = `OVERVIEW\n`;
    section += `- Total Issues: ${data.issues.length}\n`;
    section += `- Quality Score: ${data.qualityScore}/100\n`;
    section += `- Security Hotspots: ${data.hotspots.length}\n`;

    if (data.metricsMap.duplicated_lines_density?.value) {
      const dupPercentage = parseFloat(data.metricsMap.duplicated_lines_density.value);
      let dupEmoji: string;
      if (dupPercentage < 3) {
        dupEmoji = '✅';
      } else if (dupPercentage < 5) {
        dupEmoji = '⚠️';
      } else {
        dupEmoji = '❌';
      }
      section += `- ${dupEmoji} Code Duplication: ${dupPercentage.toFixed(1)}%\n`;
    }

    if (data.metricsMap.coverage?.value) {
      const coverage = parseFloat(data.metricsMap.coverage.value);
      let covEmoji: string;
      if (coverage >= 80) {
        covEmoji = '✅';
      } else if (coverage >= 50) {
        covEmoji = '⚠️';
      } else {
        covEmoji = '❌';
      }
      section += `- ${covEmoji} Test Coverage: ${coverage.toFixed(1)}%\n`;
    }

    return section + '\n';
  }

  private buildIssuesBreakdown(data: ReportData): string {
    let section = `ISSUES BREAKDOWN\n\nBY SEVERITY:\n`;
    Object.entries(data.bySeverity).forEach(([severity, items]: [string, any]) => {
      const emoji = this.getSeverityIcon(severity);
      section += `- ${emoji} ${severity}: ${items.length}\n`;
    });

    section += `\nBY TYPE (Legacy Classification):\n`;
    Object.entries(data.byType).forEach(([type, items]: [string, any]) => {
      const emoji = this.getIssueTypeIcon(type);
      section += `- ${emoji} ${type}: ${items.length}\n`;
    });

    // Add Clean Code / Software Quality Impacts
    section += `\nBY SOFTWARE QUALITY IMPACT (Clean Code):\n`;
    const reliabilityIssues = this.parseCleanCodeMetric(data.metricsMap.reliability_issues?.value);
    const maintainabilityIssues = this.parseCleanCodeMetric(data.metricsMap.maintainability_issues?.value);
    const securityIssues = this.parseCleanCodeMetric(data.metricsMap.security_issues?.value);

    section += `- 🐛 Reliability: ${reliabilityIssues.total}\n`;
    section += `- 🔧 Maintainability: ${maintainabilityIssues.total}\n`;
    section += `- 🔒 Security: ${securityIssues.total}\n`;

    if (reliabilityIssues.total > 0 || maintainabilityIssues.total > 0 || securityIssues.total > 0) {
      section += `\nNote: Clean Code metrics may differ from legacy types because:\n`;
      section += `  • A single issue can impact multiple quality attributes\n`;
      section += `  • Impacts are based on actual effect, not issue classification\n`;
    }

    return section + '\n';
  }

  private parseCleanCodeMetric(value: string | undefined): { total: number; breakdown: any } {
    if (!value) {
      return { total: 0, breakdown: {} };
    }

    try {
      const parsed = JSON.parse(value);
      return {
        total: parsed.total || 0,
        breakdown: {
          blocker: parsed.BLOCKER || 0,
          high: parsed.HIGH || 0,
          medium: parsed.MEDIUM || 0,
          low: parsed.LOW || 0,
          info: parsed.INFO || 0
        }
      };
    } catch {
      return { total: 0, breakdown: {} };
    }
  }

  private buildSecurityHotspotsSection(data: ReportData): string {
    let section = `SECURITY HOTSPOTS ANALYSIS\n`;

    if (data.hotspots.length === 0) {
      return section + `✅ No security hotspots requiring review\n\n`;
    }

    const hotspotsByStatus = groupBy(data.hotspots, 'status');
    const hotspotsByProbability = groupBy(data.hotspots, 'vulnerabilityProbability');

    section += `Total: ${data.hotspots.length} hotspots\n\n`;
    section += this.formatHotspotsByStatus(hotspotsByStatus);
    section += this.formatHotspotsByProbability(hotspotsByProbability);
    section += this.formatTopHotspots(data.hotspots);

    return section;
  }

  private formatHotspotsByStatus(hotspotsByStatus: any): string {
    let section = `BY STATUS:\n`;
    Object.entries(hotspotsByStatus).forEach(([status, items]: [string, any]) => {
      let statusEmoji: string;
      if (status === 'TO_REVIEW') {
        statusEmoji = '🔍';
      } else if (status === 'REVIEWED') {
        statusEmoji = '✅';
      } else {
        statusEmoji = '🔧';
      }
      section += `- ${statusEmoji} ${status}: ${items.length}\n`;
    });
    return section;
  }

  private formatHotspotsByProbability(hotspotsByProbability: any): string {
    let section = `\nBY VULNERABILITY PROBABILITY:\n`;
    Object.entries(hotspotsByProbability).forEach(([prob, items]: [string, any]) => {
      let probEmoji: string;
      if (prob === 'HIGH') {
        probEmoji = '🔴';
      } else if (prob === 'MEDIUM') {
        probEmoji = '🟡';
      } else {
        probEmoji = '🟢';
      }
      section += `- ${probEmoji} ${prob}: ${items.length}\n`;
    });
    return section;
  }

  private formatTopHotspots(hotspots: any[]): string {
    const toReviewHotspots = hotspots.filter(h => h.status === 'TO_REVIEW').slice(0, 5);
    if (toReviewHotspots.length === 0) return '\n';

    let section = `\nTOP HOTSPOTS REQUIRING REVIEW:\n`;
    toReviewHotspots.forEach((hotspot: any, index: number) => {
      let probEmoji: string;
      if (hotspot.vulnerabilityProbability === 'HIGH') {
        probEmoji = '🔴';
      } else if (hotspot.vulnerabilityProbability === 'MEDIUM') {
        probEmoji = '🟡';
      } else {
        probEmoji = '🟢';
      }
      const fileName = hotspot.component?.split(':')?.pop() ?? 'unknown';
      section += `${index + 1}. ${probEmoji} ${hotspot.securityCategory ?? 'Security Issue'}\n`;
      section += `   ${hotspot.message ?? 'No message'}\n`;
      section += `   File: ${fileName} (line ${hotspot.line ?? 'unknown'})\n`;
      section += `   Key: ${hotspot.key}\n\n`;
    });

    section += `💡 Use sonar_get_security_hotspot_details(hotspotKey: "key") for detailed analysis and fix recommendations.\n\n`;
    return section;
  }

  private buildDuplicationSection(data: ReportData): string {
    let section = `CODE DUPLICATION ANALYSIS\n`;

    if (!data.metricsMap.duplicated_lines_density?.value) {
      return section + `ℹ️ Duplication metrics not available\n\n`;
    }

    const dupPercentage = parseFloat(data.metricsMap.duplicated_lines_density.value);
    let dupEmoji: string;
    if (dupPercentage < 3) {
      dupEmoji = '✅';
    } else if (dupPercentage < 5) {
      dupEmoji = '⚠️';
    } else {
      dupEmoji = '❌';
    }
    section += `${dupEmoji} Duplication Percentage: ${dupPercentage.toFixed(1)}%\n`;

    if (data.metricsMap.duplicated_lines?.value) {
      section += `- Duplicated Lines: ${parseInt(data.metricsMap.duplicated_lines.value).toLocaleString()}\n`;
    }
    if (data.metricsMap.duplicated_blocks?.value) {
      section += `- Duplicated Blocks: ${data.metricsMap.duplicated_blocks.value}\n`;
    }
    if (data.metricsMap.duplicated_files?.value) {
      section += `- Duplicated Files: ${data.metricsMap.duplicated_files.value}\n`;
    }

    return section + '\n';
  }

  private buildCodeMetricsSection(data: ReportData): string {
    if (!data.metricsMap.lines?.value && !data.metricsMap.ncloc?.value) {
      return '';
    }

    let section = `CODE METRICS\n`;
    if (data.metricsMap.lines?.value) {
      section += `- Total Lines: ${parseInt(data.metricsMap.lines.value).toLocaleString()}\n`;
    }
    if (data.metricsMap.ncloc?.value) {
      section += `- Lines of Code: ${parseInt(data.metricsMap.ncloc.value).toLocaleString()}\n`;
    }
    if (data.metricsMap.complexity?.value) {
      section += `- Complexity: ${data.metricsMap.complexity.value}\n`;
    }

    return section + '\n';
  }

  private buildTopIssuesSection(data: ReportData): string {
    const sortedIssues = [...data.issues].sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
    const topIssues = sortedIssues.slice(0, 5);

    if (topIssues.length === 0) return '';

    let section = `TOP PRIORITY ISSUES TO FIX\n`;
    topIssues.forEach((issue, idx) => {
      const severityEmoji = this.getSeverityIcon(issue.severity);
      const typeEmoji = this.getIssueTypeIcon(issue.type);
      const fileName = issue.component.split(':').pop();

      section += `${idx + 1}. ${severityEmoji} ${typeEmoji} ${issue.message}\n`;
      section += `   File: ${fileName} (line ${issue.line ?? 'unknown'})\n`;
      section += `   Rule: ${issue.rule}\n`;
      section += `   Key: ${issue.key}\n\n`;
    });

    return section;
  }

  private buildRecommendationsSection(data: ReportData): string {
    let section = `RECOMMENDATIONS\n\n`;

    const toReviewCount = data.hotspots.filter(h => h.status === 'TO_REVIEW').length;
    if (toReviewCount > 0) {
      section += `🔍 Review ${toReviewCount} security hotspots\n`;
    }

    const criticalCount = data.issues.filter(i => ['BLOCKER', 'CRITICAL'].includes(i.severity)).length;
    if (criticalCount > 0) {
      section += `🚨 Fix ${criticalCount} critical/blocker issues\n`;
    }

    if (data.metricsMap.duplicated_lines_density?.value &&
        parseFloat(data.metricsMap.duplicated_lines_density.value) > 5) {
      section += `♻️ Refactor duplicated code to reduce duplication below 5%\n`;
    }

    if (data.metricsMap.coverage?.value &&
        parseFloat(data.metricsMap.coverage.value) < 80) {
      section += `🧪 Improve test coverage (currently ${parseFloat(data.metricsMap.coverage.value).toFixed(1)}%)\n`;
    }

    return section;
  }
}
