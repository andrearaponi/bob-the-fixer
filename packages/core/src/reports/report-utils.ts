/**
 * Format SonarQube rating (1.0-5.0) to letter grade
 */
import { ReportFormatter, JsonReportFormatter, TextReportFormatter } from './comprehensive-report.js';

export function formatRating(rating: string): string {
  const num = parseFloat(rating);
  switch (Math.floor(num)) {
    case 1: return 'A (Excellent)';
    case 2: return 'B (Good)';
    case 3: return 'C (Acceptable)';
    case 4: return 'D (Poor)';
    case 5: return 'E (Very Poor)';
    default: return `${rating} (Unknown)`;
  }
}

/**
 * Get appropriate report formatter based on format type
 */
export function getReportFormatter(format: string, getSeverityIcon: (severity: string) => string, getIssueTypeIcon: (type: string) => string, getSeverityWeight: (severity: string) => number): ReportFormatter {
  if (format === 'json') {
    return new JsonReportFormatter();
  }
  return new TextReportFormatter(
    getSeverityIcon,
    getIssueTypeIcon,
    getSeverityWeight
  );
}