import { formatRating } from './report-utils.js';

export type MetricsMap = { [key: string]: any };

export interface MetricSection {
  name: string;
  format(metricsMap: MetricsMap): string;
}

export class QualityGateSection implements MetricSection {
  name = 'Quality Gate';

  format(metricsMap: MetricsMap): string {
    const alertStatus = metricsMap.alert_status?.value ?? 'UNKNOWN';
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
}

export class CodeSizeSection implements MetricSection {
  name = 'Code Size';

  format(metricsMap: MetricsMap): string {
    let section = `CODE SIZE:\n`;

    if (metricsMap.lines?.value) {
      section += `- Total Lines: ${parseInt(metricsMap.lines.value).toLocaleString()}\n`;
    }
    if (metricsMap.ncloc?.value) {
      section += `- Lines of Code: ${parseInt(metricsMap.ncloc.value).toLocaleString()}\n`;
    }

    return section + '\n';
  }
}

export class DuplicationSection implements MetricSection {
  name = 'Duplication';

  format(metricsMap: MetricsMap): string {
    let section = `DUPLICATION ANALYSIS:\n`;

    if (metricsMap.duplicated_lines_density?.value) {
      const dupPercentage = parseFloat(metricsMap.duplicated_lines_density.value);
      let dupEmoji: string;
      if (dupPercentage < 3) {
        dupEmoji = '✅';
      } else if (dupPercentage < 5) {
        dupEmoji = '⚠️';
      } else {
        dupEmoji = '❌';
      }
      section += `- ${dupEmoji} Duplication Percentage: ${dupPercentage.toFixed(1)}%\n`;
    }
    if (metricsMap.duplicated_lines?.value) {
      section += `- Duplicated Lines: ${parseInt(metricsMap.duplicated_lines.value).toLocaleString()}\n`;
    }
    if (metricsMap.duplicated_blocks?.value) {
      section += `- Duplicated Blocks: ${metricsMap.duplicated_blocks.value}\n`;
    }
    if (metricsMap.duplicated_files?.value) {
      section += `- Duplicated Files: ${metricsMap.duplicated_files.value}\n`;
    }

    return section + '\n';
  }
}

export class CoverageSection implements MetricSection {
  name = 'Coverage';

  format(metricsMap: MetricsMap): string {
    if (!metricsMap.coverage?.value) return '';

    const coverage = parseFloat(metricsMap.coverage.value);
    let covEmoji: string;
    if (coverage >= 80) {
      covEmoji = '✅';
    } else if (coverage >= 50) {
      covEmoji = '⚠️';
    } else {
      covEmoji = '❌';
    }
    return `TEST COVERAGE:\n- ${covEmoji} Coverage: ${coverage.toFixed(1)}%\n\n`;
  }
}

export class IssuesSummarySection implements MetricSection {
  name = 'Issues Summary';

  private getCountEmoji(count: number, zeroThreshold: number, warningThreshold: number): string {
    if (count < zeroThreshold) return '✅';
    if (count < warningThreshold) return '⚠️';
    return '❌';
  }

  private getBugEmoji(count: number): string {
    return this.getCountEmoji(count, 1, 5);
  }

  private getVulnEmoji(count: number): string {
    return this.getCountEmoji(count, 1, 3);
  }

  private getSmellEmoji(count: number): string {
    return this.getCountEmoji(count, 10, 50);
  }

  private getHotspotEmoji(count: number): string {
    return this.getCountEmoji(count, 1, 5);
  }

  format(metricsMap: MetricsMap): string {
    let section = `ISSUES SUMMARY:\n`;

    if (metricsMap.bugs?.value) {
      const bugs = parseInt(metricsMap.bugs.value);
      section += `- ${this.getBugEmoji(bugs)} Bugs: ${bugs}\n`;
    }
    if (metricsMap.vulnerabilities?.value) {
      const vulns = parseInt(metricsMap.vulnerabilities.value);
      section += `- ${this.getVulnEmoji(vulns)} Vulnerabilities: ${vulns}\n`;
    }
    if (metricsMap.code_smells?.value) {
      const smells = parseInt(metricsMap.code_smells.value);
      section += `- ${this.getSmellEmoji(smells)} Code Smells: ${smells}\n`;
    }
    if (metricsMap.security_hotspots?.value) {
      const hotspots = parseInt(metricsMap.security_hotspots.value);
      section += `- ${this.getHotspotEmoji(hotspots)} Security Hotspots: ${hotspots}\n`;
    }

    return section + '\n';
  }
}

export class QualityRatingsSection implements MetricSection {
  name = 'Quality Ratings';

  private formatRating(rating: string): string {
    const num = parseFloat(rating);
    if (num === 1) return 'A (Excellent)';
    if (num === 2) return 'B (Good)';
    if (num === 3) return 'C (Fair)';
    if (num === 4) return 'D (Poor)';
    return 'E (Very Poor)';
  }

  private getRatingEmoji(rating: string): string {
    if (rating === '1.0') return '✅';
    if (rating === '2.0') return '⚠️';
    return '❌';
  }

  private formatRatingLine(label: string, rating: string): string {
    const emoji = this.getRatingEmoji(rating);
    const ratingText = formatRating(rating);
    return `- ${emoji} ${label}: ${ratingText}\n`;
  }

  format(metricsMap: MetricsMap): string {
    let section = `QUALITY RATINGS:\n`;

    if (metricsMap.reliability_rating?.value) {
      section += this.formatRatingLine('Reliability', metricsMap.reliability_rating.value);
    }
    if (metricsMap.security_rating?.value) {
      section += this.formatRatingLine('Security', metricsMap.security_rating.value);
    }
    if (metricsMap.maintainability_rating?.value) {
      section += this.formatRatingLine('Maintainability', metricsMap.maintainability_rating.value);
    }

    return section + '\n';
  }
}

export class TechnicalDebtSection implements MetricSection {
  name = 'Technical Debt';

  format(metricsMap: MetricsMap): string {
    if (!metricsMap.sqale_index?.value) return '';

    const debt = parseInt(metricsMap.sqale_index.value);
    const hours = Math.floor(debt / 60);
    const minutes = debt % 60;
    return `TECHNICAL DEBT:\n- Total Debt: ${hours}h ${minutes}m\n\n`;
  }
}

export class ComplexitySection implements MetricSection {
  name = 'Complexity';

  format(metricsMap: MetricsMap): string {
    if (!metricsMap.complexity?.value && !metricsMap.cognitive_complexity?.value) {
      return '';
    }

    let section = `COMPLEXITY:\n`;
    if (metricsMap.complexity?.value) {
      section += `- Cyclomatic Complexity: ${metricsMap.complexity.value}\n`;
    }
    if (metricsMap.cognitive_complexity?.value) {
      section += `- Cognitive Complexity: ${metricsMap.cognitive_complexity.value}\n`;
    }

    return section + '\n';
  }
}

export class ProjectMetricsReportBuilder {
  private readonly sections: MetricSection[] = [];

  addSection(section: MetricSection): this {
    this.sections.push(section);
    return this;
  }

  build(projectKey: string, componentName: string, metricsMap: MetricsMap): string {
    let report = `PROJECT METRICS ANALYSIS\n\n`;
    report += `Project: ${projectKey}\n`;
    report += `Component: ${componentName}\n\n`;

    for (const section of this.sections) {
      const sectionContent = section.format(metricsMap);
      if (sectionContent) {
        report += sectionContent;
      }
    }

    return report;
  }
}

/**
 * Build metrics map from measures array
 */
export function buildMetricsMap(measures: any[]): MetricsMap {
  const metricsMap: MetricsMap = {};
  measures.forEach(measure => {
    metricsMap[measure.metric] = measure;
  });
  return metricsMap;
}

/**
 * Build project metrics report using Builder pattern
 */
export function buildProjectMetricsReport(
  projectKey: string,
  componentName: string,
  metricsMap: MetricsMap
): string {
  return new ProjectMetricsReportBuilder()
    .addSection(new QualityGateSection())
    .addSection(new CodeSizeSection())
    .addSection(new DuplicationSection())
    .addSection(new CoverageSection())
    .addSection(new IssuesSummarySection())
    .addSection(new QualityRatingsSection())
    .addSection(new TechnicalDebtSection())
    .addSection(new ComplexitySection())
    .build(projectKey, componentName, metricsMap);
}
