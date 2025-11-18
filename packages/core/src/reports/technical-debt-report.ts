import { formatRating } from './report-utils.js';

export function buildDebtOverview(analysis: any): string {
  const ratingLetter = formatRating(analysis.maintainabilityRating);
  let report = `OVERVIEW:\n`;
  report += `- Total Technical Debt: ${Math.floor(analysis.totalDebt / 60)}h ${analysis.totalDebt % 60}m\n`;
  report += `- Debt Ratio: ${analysis.debtRatio.toFixed(1)}%\n`;
  report += `- Maintainability Rating: ${ratingLetter}\n`;

  report += analysis.effortToReachA > 0
    ? `- Effort to reach Rating A: ${Math.floor(analysis.effortToReachA / 60)}h ${analysis.effortToReachA % 60}m\n`
    : `- Already at Rating A! 🎉\n`;

  return report + `\n`;
}

export function buildDebtBreakdown(analysis: any): string {
  let report = `DEBT BREAKDOWN:\n`;
  report += `- 🐛 Bugs: ${analysis.breakdown.bugs}\n`;
  report += `- 🔒 Security Issues: ${analysis.breakdown.vulnerabilities}\n`;
  report += `- 🧹 Code Smells: ${analysis.breakdown.codeSmells}\n\n`;
  return report;
}

export function buildBudgetAnalysis(analysis: any, includeBudget: boolean): string {
  if (!includeBudget) return '';

  const totalHours = Math.ceil(analysis.totalDebt / 60);

  if (totalHours === 0) {
    return `BUDGET & PLANNING ANALYSIS:\n✅ No debt to address - focus on prevention\n\n`;
  }

  let report = `BUDGET & PLANNING ANALYSIS:\n`;
  const hoursPerDay = 8;
  const workDaysPerWeek = 5;
  const daysOfWork = Math.ceil(totalHours / hoursPerDay);
  const weeksOfWork = Math.ceil(daysOfWork / workDaysPerWeek);

  report += `- Full-time effort needed: ${totalHours} hours (${daysOfWork} days)\n`;
  if (weeksOfWork > 1) {
    report += `- If dedicated full-time: ~${weeksOfWork} week(s)\n`;
  }

  report += suggestAllocationStrategy(totalHours, weeksOfWork);
  return report + `\n`;
}

function suggestAllocationStrategy(totalHours: number, weeksOfWork: number): string {
  if (totalHours <= 4) {
    return `- 💡 Suggested approach: Address in next sprint (half-day effort)\n`;
  }

  if (totalHours <= 16) {
    return `- 💡 Suggested approach: 2-4 hours per week over ${Math.ceil(totalHours / 4)} weeks\n`;
  }

  if (totalHours <= 40) {
    return `- 💡 Suggested approach: Dedicate 20% of sprint capacity over ${Math.ceil(weeksOfWork)} weeks\n`;
  }

  return `- 💡 Suggested approach: Major refactoring initiative needed\n` +
    `- 🎯 Consider breaking into phases of 2-week chunks\n`;
}

export function buildRecommendationsSection(analysis: any): string {
  if (analysis.recommendations.length === 0) return '';

  let report = `PRIORITIZED RECOMMENDATIONS:\n`;
  analysis.recommendations.forEach((rec: string, index: number) => {
    report += `${index + 1}. ${rec}\n`;
  });
  return report + `\n`;
}

export function buildROIAnalysis(analysis: any): string {
  if (analysis.totalDebt === 0) return '';

  let report = `RETURN ON INVESTMENT:\n`;
  report += `- 📈 Reduced maintenance time after debt resolution\n`;
  report += `- 🚀 Faster feature development velocity\n`;
  report += `- 🛡️ Lower risk of bugs in production\n`;
  report += `- 👥 Improved developer experience and morale\n`;

  if (analysis.breakdown.vulnerabilities > 0) {
    report += `- 🔒 Reduced security risk exposure\n`;
  }

  return report;
}