import { describe, it, expect } from 'vitest';
import { buildPatternAnalysisReport } from './pattern-analysis-report';

describe('buildPatternAnalysisReport - Compact Format', () => {
  const mockAnalysis = {
    groups: [
      {
        pattern: 'Unused variables should be removed',
        rule: 'typescript:S1481',
        count: 45,
        files: ['main.ts', 'utils.ts', 'helpers.ts', 'service.ts', 'index.ts'],
        fixability: 'trivial',
        estimatedTime: 225,
        impact: {
          debtReduction: 90,
          affectedMetrics: ['code_smell_count', 'maintainability_rating'],
          estimatedDebtReductionPercent: 2
        }
      },
      {
        pattern: 'Potential null pointer exception',
        rule: 'java:S2259',
        count: 38,
        files: ['Calculator.java', 'Parser.java', 'Service.java'],
        fixability: 'medium',
        estimatedTime: 760,
        impact: {
          debtReduction: 380,
          affectedMetrics: ['bugs', 'reliability_rating'],
          estimatedDebtReductionPercent: 11
        }
      }
    ],
    summary: {
      totalIssues: 347,
      groupedIssues: 83,
      groupCount: 23,
      estimatedTotalTime: 5670,
      estimatedTotalDebtReduction: 3420,
      coveragePercent: 100
    }
  };

  it('should NOT contain decorative lines', () => {
    const report = buildPatternAnalysisReport(mockAnalysis, true);

    // Should not contain repeated = or - for decoration
    expect(report).not.toContain('═'.repeat(10));
    expect(report).not.toContain('─'.repeat(10));
    expect(report).not.toContain('='.repeat(10));
  });

  it('should start with markdown header', () => {
    const report = buildPatternAnalysisReport(mockAnalysis, true);

    expect(report).toMatch(/^# Pattern Analysis:/);
  });

  it('should use markdown table format for summary', () => {
    const report = buildPatternAnalysisReport(mockAnalysis, true);

    // Should contain markdown table structure
    expect(report).toContain('| Metric |');
    expect(report).toContain('|---');
  });

  it('should use compact pattern representation', () => {
    const report = buildPatternAnalysisReport(mockAnalysis, true);

    // Should use abbreviated file notation
    expect(report).toMatch(/main\.ts \+\d/);
    // Should not have verbose "Issues:" labels
    expect(report).not.toContain('Issues: 45');
  });

  it('should be at least 50% shorter than verbose format', () => {
    const report = buildPatternAnalysisReport(mockAnalysis, true);

    // Baseline from current verbose implementation ~4500 chars for this data
    const verboseBaseline = 1500;

    // Compact should be significantly smaller
    expect(report.length).toBeLessThan(verboseBaseline);
  });

  it('should include essential information', () => {
    const report = buildPatternAnalysisReport(mockAnalysis, true);

    // Should still have key info
    expect(report).toContain('347'); // total issues
    expect(report).toContain('23'); // group count
    expect(report).toContain('typescript:S1481'); // rule key
  });

  it('should include fix guidance at the end', () => {
    const report = buildPatternAnalysisReport(mockAnalysis, true);

    expect(report).toContain('sonar_get_issue_details');
  });
});
