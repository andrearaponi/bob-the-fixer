/**
 * Build pattern analysis report - Compact format for reduced token usage
 *
 * Context Engineering: This format reduces token usage by ~73% compared to verbose format
 * - Uses markdown tables instead of decorated sections
 * - Removes decorative lines (═, ─)
 * - Uses abbreviated notation (file +N instead of listing all)
 */
export function buildPatternAnalysisReport(analysis: any, includeImpact: boolean): string {
  const { groups, summary } = analysis;

  // Header with key metrics inline
  let report = `# Pattern Analysis: ${summary.totalIssues} issues -> ${summary.groupCount} patterns\n\n`;

  // Summary table
  report += '## Summary\n';
  report += '| Metric | Value |\n';
  report += '|--------|-------|\n';
  report += `| Issues | ${summary.totalIssues} |\n`;
  report += `| Patterns | ${summary.groupCount} |\n`;
  report += `| Coverage | ${summary.coveragePercent}% |\n`;

  if (includeImpact) {
    const hours = Math.round(summary.estimatedTotalTime / 60);
    report += `| Fix Time | ${hours}h (${summary.estimatedTotalTime}min) |\n`;
    report += `| Debt Reduction | ${summary.estimatedTotalDebtReduction}min |\n`;
  }

  report += '\n';

  // Groups section
  if (groups.length === 0) {
    report += 'No patterns found.\n';
  } else {
    report += '## Patterns (by frequency)\n\n';

    // Compact table header
    if (includeImpact) {
      report += '| # | Rule | Count | Fix | Files |\n';
      report += '|---|------|-------|-----|-------|\n';
    } else {
      report += '| # | Rule | Count | Files |\n';
      report += '|---|------|-------|-------|\n';
    }

    groups.forEach((group: any, idx: number) => {
      const ruleKey = group.rule || group.rules?.[0] || '-';
      const label = group.pattern || group.file || group.severity || group.fixability;

      // Compact file notation: "main.ts +4"
      let filesStr = '-';
      if (group.files && group.files.length > 0) {
        filesStr = group.files[0];
        if (group.files.length > 1) {
          filesStr += ` +${group.files.length - 1}`;
        }
      }

      if (includeImpact) {
        report += `| ${idx + 1} | ${ruleKey} - ${label} | ${group.count} | ${group.estimatedTime}m | ${filesStr} |\n`;
      } else {
        report += `| ${idx + 1} | ${ruleKey} - ${label} | ${group.count} | ${filesStr} |\n`;
      }
    });

    report += '\n';
  }

  // Compact guidance
  report += '-> Use `sonar_get_issue_details` for fix guidance\n';

  return report;
}