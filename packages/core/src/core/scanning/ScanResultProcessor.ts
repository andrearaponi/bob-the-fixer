/**
 * ScanResultProcessor
 * Processes and formats scan results for presentation
 */

import { ScanResult } from '../../shared/types/index.js';

export class ScanResultProcessor {
  /**
   * Format scan result as text summary
   */
  static formatAsTextSummary(result: ScanResult): string {
    let summary = `SONARQUBE ANALYSIS RESULTS\n\n`;
    summary += `Project: ${result.projectKey}\n`;
    summary += `Total Issues: ${result.totalIssues}\n`;

    // Add Java compilation warning if applicable
    if (result.projectContext.language.includes('java')) {
      summary += `\nNOTE: Java project detected - ensure code is compiled before scanning for accurate results\n`;
      if (result.projectContext.buildTool === 'maven') {
        summary += `Compile with: mvn clean compile\n`;
      } else if (result.projectContext.buildTool === 'gradle') {
        summary += `Compile with: ./gradlew compileJava\n`;
      }
    }

    summary += `\n`;
    summary += `BY SEVERITY:\n`;
    for (const [severity, count] of Object.entries(result.issuesBySeverity)) {
      summary += `- ${severity}: ${count}\n`;
    }

    // Add issues by type if available
    if (result.issuesByType && Object.keys(result.issuesByType).length > 0) {
      summary += `\nBY TYPE (Legacy):\n`;
      for (const [type, count] of Object.entries(result.issuesByType)) {
        const emoji = type === 'BUG' ? '🐛' : type === 'VULNERABILITY' ? '🔒' : '🧹';
        summary += `- ${emoji} ${type}: ${count}\n`;
      }
    }

    // Add Clean Code metrics if available
    if (result.cleanCodeMetrics) {
      summary += `\nBY SOFTWARE QUALITY IMPACT (Clean Code):\n`;
      summary += `- 🐛 Reliability: ${result.cleanCodeMetrics.reliability}\n`;
      summary += `- 🔧 Maintainability: ${result.cleanCodeMetrics.maintainability}\n`;
      summary += `- 🔒 Security: ${result.cleanCodeMetrics.security}\n`;
    }

    summary += `\nQuality Score: ${result.qualityScore}/100\n\n`;

    // Add security hotspots section
    if (result.securityHotspots && result.securityHotspots.total > 0) {
      summary += `🔒 SECURITY HOTSPOTS: ${result.securityHotspots.total}\n`;
      summary += `BY PROBABILITY:\n`;
      for (const [probability, count] of Object.entries(result.securityHotspots.byProbability)) {
        const emoji = probability === 'HIGH' ? '🔴' : probability === 'MEDIUM' ? '🟡' : '🟢';
        summary += `- ${emoji} ${probability}: ${count}\n`;
      }
      summary += `\n`;

      if (result.securityHotspots.topHotspots.length > 0) {
        summary += `TOP SECURITY HOTSPOTS TO REVIEW:\n`;
        result.securityHotspots.topHotspots.forEach((hotspot, idx) => {
          const emoji = hotspot.vulnerabilityProbability === 'HIGH' ? '🔴' :
                       hotspot.vulnerabilityProbability === 'MEDIUM' ? '🟡' : '🟢';
          summary += `${idx + 1}. ${emoji} ${hotspot.vulnerabilityProbability} - ${hotspot.securityCategory}: ${hotspot.message}\n`;
          summary += `   Hotspot Key: ${hotspot.key}\n`;
          summary += `   File: ${hotspot.component} (line ${hotspot.line ?? 'unknown'})\n`;
          summary += `   Status: ${hotspot.status}\n\n`;
        });
      }
    }

    if (result.topIssues.length > 0) {
      summary += `TOP PRIORITY ISSUES:\n`;
      result.topIssues.forEach((issue, idx) => {
        summary += `${idx + 1}. ${issue.severity} ${issue.type}: ${issue.message}\n`;
        summary += `   Issue Key: ${issue.key}\n`;
        summary += `   File: ${issue.component} (line ${issue.line ?? 'unknown'})\n\n`;
      });
    }

    // Show info about config source
    if (result.configSource === 'auto-detected' && result.preScanValidation?.detectedProperties?.length) {
      summary += `\n📝 AUTO-GENERATED: sonar-project.properties was created with ${result.preScanValidation.detectedProperties.length} detected properties\n`;
      summary += `   Future scans will use this file for consistent results and coverage reporting.\n`;
    }

    return summary;
  }

  /**
   * Format scan result as JSON
   */
  static formatAsJson(result: ScanResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Extract insights from scan result
   */
  static extractInsights(result: ScanResult): {
    criticalIssues: number;
    blockerIssues: number;
    hasSecurityIssues: boolean;
    needsAttention: boolean;
  } {
    const criticalIssues = result.issuesBySeverity['CRITICAL'] || 0;
    const blockerIssues = result.issuesBySeverity['BLOCKER'] || 0;
    const vulnerabilities = result.topIssues.filter(i => i.type === 'VULNERABILITY').length;

    return {
      criticalIssues,
      blockerIssues,
      hasSecurityIssues: vulnerabilities > 0,
      needsAttention: blockerIssues > 0 || criticalIssues > 0 || result.qualityScore < 60
    };
  }

  /**
   * Generate recommendations based on scan results
   */
  static generateRecommendations(result: ScanResult): string[] {
    const recommendations: string[] = [];
    const insights = this.extractInsights(result);

    if (insights.blockerIssues > 0) {
      recommendations.push(`🚨 ${insights.blockerIssues} BLOCKER issues found - these should be fixed immediately`);
    }

    if (insights.criticalIssues > 0) {
      recommendations.push(`⚠️ ${insights.criticalIssues} CRITICAL issues found - high priority for fixing`);
    }

    if (insights.hasSecurityIssues) {
      recommendations.push(`🔒 Security vulnerabilities detected - review and fix as soon as possible`);
    }

    if (result.qualityScore < 60) {
      recommendations.push(`📉 Quality score is low (${result.qualityScore}/100) - focus on reducing technical debt`);
    } else if (result.qualityScore >= 80) {
      recommendations.push(`✨ Good quality score (${result.qualityScore}/100) - keep up the good work!`);
    }

    if (result.totalIssues === 0) {
      recommendations.push(`🎉 No issues found - excellent code quality!`);
    }

    return recommendations;
  }
}
