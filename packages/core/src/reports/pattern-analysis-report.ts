/**
 * Build pattern analysis report
 */
export function buildPatternAnalysisReport(analysis: any, includeImpact: boolean): string {
  const { groups, summary } = analysis;

  let report = '📊 Pattern Analysis Report\n';
  report += '═'.repeat(80) + '\n\n';

  // Summary section
  report += '📈 Summary\n';
  report += '─'.repeat(80) + '\n';
  report += `Total Issues: ${summary.totalIssues}\n`;
  report += `Groups Found: ${summary.groupCount}\n`;
  report += `Coverage: ${summary.coveragePercent}% of issues grouped\n`;

  if (includeImpact) {
    const hours = Math.round(summary.estimatedTotalTime / 60);
    report += `Estimated Fix Time: ${summary.estimatedTotalTime} minutes (${hours}h)\n`;
    report += `Total Debt Reduction: ${summary.estimatedTotalDebtReduction} minutes\n`;
  }

  report += '\n';

  // Groups section
  if (groups.length === 0) {
    report += 'No patterns found.\n';
  } else {
    report += `📋 Issue Groups (sorted by frequency)\n`;
    report += '─'.repeat(80) + '\n\n';

    groups.forEach((group: any, idx: number) => {
      const label = group.pattern || group.file || group.severity || group.fixability;
      report += `${idx + 1}. ${label}\n`;
      report += `   Issues: ${group.count}\n`;

      if (group.files && group.files.length > 0) {
        const displayFiles = group.files.slice(0, 3).join(', ');
        const suffix = group.files.length > 3 ? ` (+${group.files.length - 3} more)` : '';
        report += `   Files: ${displayFiles}${suffix}\n`;
      }

      if (group.rules && group.rules.length > 0) {
        report += `   Rules: ${group.rules.join(', ')}\n`;
      }

      if (group.severities && group.severities.length > 0) {
        report += `   Severities: ${group.severities.join(', ')}\n`;
      }

      report += `   Fixability: ${group.fixability}\n`;

      if (includeImpact) {
        report += `   Estimated Fix Time: ${group.estimatedTime} min\n`;
        report += `   Debt Reduction: ${group.impact.debtReduction} min (${group.impact.estimatedDebtReductionPercent}%)\n`;

        if (group.impact.affectedMetrics.length > 0) {
          report += `   Affected Metrics: ${group.impact.affectedMetrics.join(', ')}\n`;
        }
      }

      report += '\n';
    });
  }

  report += '─'.repeat(80) + '\n';
  report += 'Use sonar_get_issue_details tool to examine specific issues and apply fixes.\n';

  return report;
}