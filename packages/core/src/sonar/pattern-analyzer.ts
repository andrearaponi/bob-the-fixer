/**
 * Pattern Analysis for SonarQube Issues
 * Groups and analyzes issues to identify patterns, fixability, and impact
 * Uses dynamic rule info from SonarQube (no hardcoding!)
 */

import { SonarIssue } from './types';

export interface IssueGroup {
  pattern?: string;
  rule?: string;
  file?: string;
  severity?: string;
  fixability?: string;
  count: number;
  issues: SonarIssue[];
  files?: string[];
  rules?: string[];
  severities?: string[];
  estimatedTime: number;
  impact: {
    debtReduction: number;
    affectedMetrics: string[];
    estimatedDebtReductionPercent: number;
  };
}

export interface PatternAnalysisResult {
  groups: IssueGroup[];
  summary: {
    totalIssues: number;
    groupedIssues: number;
    groupCount: number;
    estimatedTotalTime: number;
    estimatedTotalDebtReduction: number;
    coveragePercent: number;
  };
  ruleCache: { [key: string]: any };
}

export class PatternAnalyzer {
  /**
   * Analyze issues and group by pattern
   * @param issues - SonarQube issues
   * @param ruleCache - Rule details fetched from SonarQube
   * @param groupBy - Grouping strategy
   */
  static analyze(
    issues: SonarIssue[],
    ruleCache: { [key: string]: any },
    groupBy: 'pattern' | 'file' | 'severity' | 'fixability' = 'pattern'
  ): PatternAnalysisResult {
    let groups: IssueGroup[] = [];

    switch (groupBy) {
      case 'pattern':
        groups = this.groupByPattern(issues, ruleCache);
        break;
      case 'file':
        groups = this.groupByFile(issues, ruleCache);
        break;
      case 'severity':
        groups = this.groupBySeverity(issues, ruleCache);
        break;
      case 'fixability':
        groups = this.groupByFixability(issues, ruleCache);
        break;
    }

    // Calculate summary
    const groupedIssues = groups.reduce((sum, g) => sum + g.count, 0);
    const totalTime = groups.reduce((sum, g) => sum + g.estimatedTime, 0);
    const totalDebt = groups.reduce((sum, g) => sum + g.impact.debtReduction, 0);

    return {
      groups,
      summary: {
        totalIssues: issues.length,
        groupedIssues,
        groupCount: groups.length,
        estimatedTotalTime: totalTime,
        estimatedTotalDebtReduction: totalDebt,
        coveragePercent: issues.length > 0 ? Math.round((groupedIssues / issues.length) * 100) : 0
      },
      ruleCache
    };
  }

  /**
   * Group by pattern (rule)
   */
  private static groupByPattern(issues: SonarIssue[], ruleCache: { [key: string]: any }): IssueGroup[] {
    const groups: { [key: string]: IssueGroup } = {};

    issues.forEach(issue => {
      const key = issue.rule;
      if (!groups[key]) {
        const ruleInfo = ruleCache[key];
        groups[key] = {
          pattern: ruleInfo?.name || key,
          rule: key,
          count: 0,
          issues: [],
          files: new Set() as any,
          fixability: this.scoreFixabilityForRule(ruleInfo, key),
          estimatedTime: 0,
          impact: {
            debtReduction: 0,
            affectedMetrics: [],
            estimatedDebtReductionPercent: 0
          }
        };
      }
      groups[key].count++;
      (groups[key].files as any).add(this.extractFileName(issue.component));
      groups[key].issues.push(issue);
    });

    // Process groups
    return Object.values(groups)
      .map(g => {
        const files = Array.from((g.files as any) as Set<string>);
        const estimatedTime = this.estimateFixTime(ruleCache[g.rule!], g.rule!, g.count);
        const debtReduction = this.estimateDebtReduction(ruleCache[g.rule!], g.rule!, g.count);

        return {
          ...g,
          files,
          estimatedTime,
          impact: {
            debtReduction,
            affectedMetrics: this.getAffectedMetrics(ruleCache[g.rule!], g.rule!, g.issues),
            estimatedDebtReductionPercent: Math.round((debtReduction / 1000) * 100)
          }
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Group by file
   */
  private static groupByFile(issues: SonarIssue[], ruleCache: { [key: string]: any }): IssueGroup[] {
    const groups: { [key: string]: IssueGroup } = {};

    issues.forEach(issue => {
      const file = this.extractFileName(issue.component);
      if (!groups[file]) {
        groups[file] = {
          file,
          count: 0,
          issues: [],
          rules: new Set() as any,
          severities: new Set() as any,
          fixability: 'medium',
          estimatedTime: 0,
          impact: {
            debtReduction: 0,
            affectedMetrics: [],
            estimatedDebtReductionPercent: 0
          }
        };
      }
      groups[file].count++;
      (groups[file].rules as any).add(issue.rule);
      (groups[file].severities as any).add(issue.severity);
      groups[file].issues.push(issue);
    });

    return Object.values(groups)
      .map(g => {
        const rules = Array.from((g.rules as any) as Set<string>);
        const severities = Array.from((g.severities as any) as Set<string>);
        const estimatedTime = g.count * 10;
        const debtReduction = g.issues.reduce((sum, i) => sum + this.estimateDebtReduction(ruleCache[i.rule], i.rule, 1), 0);

        return {
          ...g,
          rules,
          severities,
          fixability: this.scoreFixabilityForGroup(g),
          estimatedTime,
          impact: {
            debtReduction,
            affectedMetrics: Array.from(new Set(g.issues.flatMap(i => this.getAffectedMetrics(ruleCache[i.rule], i.rule, [i])))),
            estimatedDebtReductionPercent: Math.round((debtReduction / 1000) * 100)
          }
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Group by severity
   */
  private static groupBySeverity(issues: SonarIssue[], ruleCache: { [key: string]: any }): IssueGroup[] {
    const severityOrder = { BLOCKER: 0, CRITICAL: 1, MAJOR: 2, MINOR: 3, INFO: 4 };
    const groups: { [key: string]: IssueGroup } = {};

    issues.forEach(issue => {
      const sev = issue.severity;
      if (!groups[sev]) {
        groups[sev] = {
          severity: sev,
          count: 0,
          issues: [],
          rules: new Set() as any,
          fixability: 'medium',
          estimatedTime: 0,
          impact: {
            debtReduction: 0,
            affectedMetrics: [],
            estimatedDebtReductionPercent: 0
          }
        };
      }
      groups[sev].count++;
      (groups[sev].rules as any).add(issue.rule);
      groups[sev].issues.push(issue);
    });

    return Object.values(groups)
      .map(g => {
        const rules = Array.from((g.rules as any) as Set<string>);
        const estimatedTime = g.count * 10;
        const debtReduction = g.issues.reduce((sum, i) => sum + this.estimateDebtReduction(ruleCache[i.rule], i.rule, 1), 0);

        return {
          ...g,
          rules,
          fixability: this.scoreFixabilityForGroup(g),
          estimatedTime,
          impact: {
            debtReduction,
            affectedMetrics: Array.from(new Set(g.issues.flatMap(i => this.getAffectedMetrics(ruleCache[i.rule], i.rule, [i])))),
            estimatedDebtReductionPercent: Math.round((debtReduction / 1000) * 100)
          }
        };
      })
      .sort((a, b) => severityOrder[a.severity! as keyof typeof severityOrder] - severityOrder[b.severity! as keyof typeof severityOrder]);
  }

  /**
   * Group by fixability (difficulty)
   */
  private static groupByFixability(issues: SonarIssue[], ruleCache: { [key: string]: any }): IssueGroup[] {
    const groups: { [key: string]: IssueGroup } = {
      trivial: {
        fixability: 'trivial',
        count: 0,
        issues: [],
        rules: new Set() as any,
        estimatedTime: 0,
        impact: { debtReduction: 0, affectedMetrics: [], estimatedDebtReductionPercent: 0 }
      },
      easy: {
        fixability: 'easy',
        count: 0,
        issues: [],
        rules: new Set() as any,
        estimatedTime: 0,
        impact: { debtReduction: 0, affectedMetrics: [], estimatedDebtReductionPercent: 0 }
      },
      medium: {
        fixability: 'medium',
        count: 0,
        issues: [],
        rules: new Set() as any,
        estimatedTime: 0,
        impact: { debtReduction: 0, affectedMetrics: [], estimatedDebtReductionPercent: 0 }
      },
      hard: {
        fixability: 'hard',
        count: 0,
        issues: [],
        rules: new Set() as any,
        estimatedTime: 0,
        impact: { debtReduction: 0, affectedMetrics: [], estimatedDebtReductionPercent: 0 }
      }
    };

    issues.forEach(issue => {
      const fixability = this.scoreFixabilityForRule(ruleCache[issue.rule], issue.rule);
      groups[fixability].count++;
      (groups[fixability].rules as any).add(issue.rule);
      groups[fixability].issues.push(issue);
    });

    return Object.values(groups)
      .filter(g => g.count > 0)
      .map(g => {
        const rules = Array.from((g.rules as any) as Set<string>);
        const estimatedTime = g.issues.reduce((sum, i) => sum + this.estimateFixTime(ruleCache[i.rule], i.rule, 1), 0);
        const debtReduction = g.issues.reduce((sum, i) => sum + this.estimateDebtReduction(ruleCache[i.rule], i.rule, 1), 0);

        return {
          ...g,
          rules,
          estimatedTime,
          impact: {
            debtReduction,
            affectedMetrics: Array.from(new Set(g.issues.flatMap(i => this.getAffectedMetrics(ruleCache[i.rule], i.rule, [i])))),
            estimatedDebtReductionPercent: Math.round((debtReduction / 1000) * 100)
          }
        };
      });
  }

  /**
   * Score fixability based on rule type and severity
   */
  private static scoreFixabilityForRule(ruleInfo: any, ruleKey: string): string {
    if (!ruleInfo) return 'medium';

    // Based on rule type and severity
    const type = ruleInfo.type;
    const severity = ruleInfo.severity;

    // Simple heuristics
    if (type === 'BUG') return 'easy';
    if (type === 'VULNERABILITY') return 'medium';
    if (type === 'CODE_SMELL') {
      if (severity === 'CRITICAL') return 'medium';
      if (severity === 'MAJOR') return 'easy';
      return 'trivial';
    }

    return 'medium';
  }

  /**
   * Score fixability for a group
   */
  private static scoreFixabilityForGroup(group: IssueGroup): string {
    if (group.count === 1) return 'easy';
    if (group.count <= 3) return 'medium';
    return 'hard';
  }

  /**
   * Estimate time to fix in minutes
   */
  private static estimateFixTime(ruleInfo: any, ruleKey: string, count: number): number {
    if (!ruleInfo) return 10 * count;

    // Base time depends on type
    let baseTime = 10;
    if (ruleInfo.type === 'BUG') baseTime = 15;
    if (ruleInfo.type === 'VULNERABILITY') baseTime = 20;
    if (ruleInfo.type === 'CODE_SMELL') {
      if (ruleInfo.severity === 'CRITICAL') baseTime = 20;
      else if (ruleInfo.severity === 'MAJOR') baseTime = 10;
      else baseTime = 5;
    }

    return baseTime * count;
  }

  /**
   * Estimate debt reduction in minutes
   */
  private static estimateDebtReduction(ruleInfo: any, ruleKey: string, count: number): number {
    if (!ruleInfo) return 10 * count;

    // Debt depends on severity
    let debt = 10;
    if (ruleInfo.severity === 'BLOCKER') debt = 30;
    else if (ruleInfo.severity === 'CRITICAL') debt = 20;
    else if (ruleInfo.severity === 'MAJOR') debt = 10;
    else if (ruleInfo.severity === 'MINOR') debt = 5;
    else debt = 2;

    return debt * count;
  }

  /**
   * Get affected metrics based on rule info
   */
  private static getAffectedMetrics(ruleInfo: any, ruleKey: string, issues: SonarIssue[]): string[] {
    const metrics = new Set<string>();

    if (!ruleInfo) return [];

    // Add metrics based on issue type
    if (ruleInfo.type === 'BUG') {
      metrics.add('bugs');
      metrics.add('reliability_rating');
    }
    if (ruleInfo.type === 'VULNERABILITY') {
      metrics.add('vulnerabilities');
      metrics.add('security_rating');
    }
    if (ruleInfo.type === 'CODE_SMELL') {
      metrics.add('code_smell_count');
      metrics.add('maintainability_rating');
    }

    // Add based on impacts if available
    if (ruleInfo.impacts && ruleInfo.impacts.length > 0) {
      ruleInfo.impacts.forEach((impact: any) => {
        metrics.add(impact.softwareQuality.toLowerCase());
      });
    }

    return Array.from(metrics);
  }

  /**
   * Extract file name from component path
   */
  private static extractFileName(component: string): string {
    const parts = component.split(':');
    const pathParts = parts[parts.length - 1].split('/');
    return pathParts[pathParts.length - 1];
  }
}
