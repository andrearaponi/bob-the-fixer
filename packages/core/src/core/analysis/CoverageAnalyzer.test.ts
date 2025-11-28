/**
 * CoverageAnalyzer Tests
 * TDD approach: Tests written first, implementation follows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CoverageAnalyzer } from './CoverageAnalyzer';
import { SonarLineCoverage, CoverageGap } from '../../sonar/types';

describe('CoverageAnalyzer', () => {
  let analyzer: CoverageAnalyzer;

  beforeEach(() => {
    analyzer = new CoverageAnalyzer();
  });

  describe('findCoverageGaps', () => {
    it('should identify consecutive uncovered lines as a single gap', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: 'function test() {', lineHits: 1 },
        { line: 2, code: '  const x = 1;', lineHits: 1 },
        { line: 3, code: '  if (x > 0) {', lineHits: 0 },  // Gap starts
        { line: 4, code: '    return true;', lineHits: 0 }, // Gap continues
        { line: 5, code: '  }', lineHits: 0 },               // Gap ends
        { line: 6, code: '  return false;', lineHits: 1 },
        { line: 7, code: '}' },  // Non-executable
      ];

      const gaps = analyzer.findCoverageGaps(lines);

      expect(gaps).toHaveLength(1);
      expect(gaps[0].startLine).toBe(3);
      expect(gaps[0].endLine).toBe(5);
      expect(gaps[0].type).toBe('uncovered');
      expect(gaps[0].lines).toHaveLength(3);
    });

    it('should identify multiple separate gaps', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: 'function test() {', lineHits: 1 },
        { line: 2, code: '  const x = 1;', lineHits: 0 },  // Gap 1
        { line: 3, code: '  const y = 2;', lineHits: 1 },
        { line: 4, code: '  if (x > 0) {', lineHits: 0 },  // Gap 2 starts
        { line: 5, code: '    return true;', lineHits: 0 }, // Gap 2 continues
        { line: 6, code: '  }', lineHits: 1 },
      ];

      const gaps = analyzer.findCoverageGaps(lines);

      expect(gaps).toHaveLength(2);
      expect(gaps[0].startLine).toBe(2);
      expect(gaps[0].endLine).toBe(2);
      expect(gaps[1].startLine).toBe(4);
      expect(gaps[1].endLine).toBe(5);
    });

    it('should identify partial branch coverage as a gap', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: 'function test() {', lineHits: 1 },
        { line: 2, code: '  if (x > 0) {', lineHits: 2, conditions: 2, coveredConditions: 1 }, // Partial
        { line: 3, code: '    return true;', lineHits: 2 },
        { line: 4, code: '  }', lineHits: 2 },
      ];

      const gaps = analyzer.findCoverageGaps(lines);

      expect(gaps).toHaveLength(1);
      expect(gaps[0].startLine).toBe(2);
      expect(gaps[0].endLine).toBe(2);
      expect(gaps[0].type).toBe('partial_branch');
    });

    it('should return empty array when all lines are covered', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: 'function test() {', lineHits: 1 },
        { line: 2, code: '  return 42;', lineHits: 1 },
        { line: 3, code: '}', lineHits: 1 },
      ];

      const gaps = analyzer.findCoverageGaps(lines);

      expect(gaps).toHaveLength(0);
    });

    it('should ignore non-executable lines (no lineHits property)', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: '// Comment' },           // Non-executable
        { line: 2, code: '' },                      // Blank line
        { line: 3, code: 'package com.example;' }, // Package declaration
        { line: 4, code: 'function test() {', lineHits: 1 },
        { line: 5, code: '  return 42;', lineHits: 1 },
      ];

      const gaps = analyzer.findCoverageGaps(lines);

      expect(gaps).toHaveLength(0);
    });

    it('should include code snippet in gap', () => {
      const lines: SonarLineCoverage[] = [
        { line: 10, code: '  if (error) {', lineHits: 0 },
        { line: 11, code: '    throw new Error("Oops");', lineHits: 0 },
        { line: 12, code: '  }', lineHits: 0 },
      ];

      const gaps = analyzer.findCoverageGaps(lines);

      expect(gaps).toHaveLength(1);
      expect(gaps[0].codeSnippet).toContain('if (error)');
      expect(gaps[0].codeSnippet).toContain('throw new Error');
    });

    it('should handle minGapSize filter', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: 'function test() {', lineHits: 1 },
        { line: 2, code: '  const x = 1;', lineHits: 0 },  // Single line gap
        { line: 3, code: '  const y = 2;', lineHits: 1 },
        { line: 4, code: '  if (x > 0) {', lineHits: 0 },  // 3 line gap
        { line: 5, code: '    return true;', lineHits: 0 },
        { line: 6, code: '  }', lineHits: 0 },
        { line: 7, code: '  return false;', lineHits: 1 },
      ];

      // Only gaps with 3+ lines
      const gaps = analyzer.findCoverageGaps(lines, { minGapSize: 3 });

      expect(gaps).toHaveLength(1);
      expect(gaps[0].startLine).toBe(4);
      expect(gaps[0].endLine).toBe(6);
    });
  });

  describe('analyzeCoverage', () => {
    it('should calculate correct coverage statistics', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: '// Comment' },                    // Non-executable
        { line: 2, code: 'function test() {', lineHits: 1 },
        { line: 3, code: '  const x = 1;', lineHits: 1 },
        { line: 4, code: '  if (x > 0) {', lineHits: 0 },
        { line: 5, code: '    return true;', lineHits: 0 },
        { line: 6, code: '  }', lineHits: 1 },
        { line: 7, code: '}' },                              // Non-executable (no lineHits)
      ];

      const result = analyzer.analyzeCoverage('test:file.ts', lines);

      expect(result.componentKey).toBe('test:file.ts');
      expect(result.totalLines).toBe(7);
      expect(result.executableLines).toBe(5);  // Lines 2,3,4,5,6 have lineHits
      expect(result.coveredLines).toBe(3);      // Lines 2,3,6 have lineHits > 0
      expect(result.uncoveredLines).toBe(2);    // Lines 4,5 have lineHits === 0
      expect(result.coveragePercentage).toBe(60); // 3/5 = 60%
      expect(result.gaps).toHaveLength(1);
    });

    it('should generate human-readable summary', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: 'function divide(a, b) {', lineHits: 5 },
        { line: 2, code: '  if (b === 0) {', lineHits: 5, conditions: 2, coveredConditions: 1 },
        { line: 3, code: '    throw new Error("Division by zero");', lineHits: 0 },
        { line: 4, code: '  }', lineHits: 0 },
        { line: 5, code: '  return a / b;', lineHits: 5 },
        { line: 6, code: '}', lineHits: 5 },
      ];

      const result = analyzer.analyzeCoverage('test:math.ts', lines);

      expect(result.summary).toContain('test:math.ts');
      expect(result.summary).toContain('gap');
      // Should mention the uncovered block and partial branch
    });

    it('should return 100% coverage when all lines covered', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: 'function test() {', lineHits: 1 },
        { line: 2, code: '  return 42;', lineHits: 1 },
        { line: 3, code: '}', lineHits: 1 },
      ];

      const result = analyzer.analyzeCoverage('test:file.ts', lines);

      expect(result.coveragePercentage).toBe(100);
      expect(result.gaps).toHaveLength(0);
      expect(result.summary).toContain('100%');
    });

    it('should handle empty file', () => {
      const lines: SonarLineCoverage[] = [];

      const result = analyzer.analyzeCoverage('test:empty.ts', lines);

      expect(result.totalLines).toBe(0);
      expect(result.executableLines).toBe(0);
      expect(result.coveragePercentage).toBe(100); // No lines = nothing to cover
      expect(result.gaps).toHaveLength(0);
    });

    it('should handle file with only non-executable lines', () => {
      const lines: SonarLineCoverage[] = [
        { line: 1, code: '// This is a comment file' },
        { line: 2, code: '// No executable code here' },
        { line: 3, code: '' },
      ];

      const result = analyzer.analyzeCoverage('test:comments.ts', lines);

      expect(result.executableLines).toBe(0);
      expect(result.coveragePercentage).toBe(100);
      expect(result.gaps).toHaveLength(0);
    });
  });

  describe('aggregateConsecutiveLines', () => {
    it('should merge adjacent uncovered lines into blocks', () => {
      const lines: SonarLineCoverage[] = [
        { line: 10, code: 'line10', lineHits: 0 },
        { line: 11, code: 'line11', lineHits: 0 },
        { line: 12, code: 'line12', lineHits: 0 },
        { line: 15, code: 'line15', lineHits: 0 },  // Gap in line numbers
        { line: 16, code: 'line16', lineHits: 0 },
      ];

      const gaps = analyzer.findCoverageGaps(lines);

      // Should be 2 gaps due to line number gap (10-12 and 15-16)
      expect(gaps).toHaveLength(2);
      expect(gaps[0].startLine).toBe(10);
      expect(gaps[0].endLine).toBe(12);
      expect(gaps[1].startLine).toBe(15);
      expect(gaps[1].endLine).toBe(16);
    });
  });

  describe('formatGapForLLM', () => {
    it('should format gap in a way useful for LLM', () => {
      const gap: CoverageGap = {
        startLine: 10,
        endLine: 15,
        type: 'uncovered',
        lines: [
          { line: 10, code: '  if (error) {', lineHits: 0 },
          { line: 11, code: '    handleError(error);', lineHits: 0 },
          { line: 12, code: '    return null;', lineHits: 0 },
          { line: 13, code: '  }', lineHits: 0 },
        ],
        codeSnippet: '  if (error) {\n    handleError(error);\n    return null;\n  }'
      };

      const formatted = analyzer.formatGapForLLM(gap);

      expect(formatted).toContain('Lines 10-15');
      expect(formatted).toContain('uncovered');
      expect(formatted).toContain('if (error)');
    });

    it('should format partial branch gap with branch info', () => {
      const gap: CoverageGap = {
        startLine: 5,
        endLine: 5,
        type: 'partial_branch',
        lines: [
          { line: 5, code: '  if (x > 0 && y < 10) {', lineHits: 3, conditions: 4, coveredConditions: 2 },
        ],
        codeSnippet: '  if (x > 0 && y < 10) {'
      };

      const formatted = analyzer.formatGapForLLM(gap);

      expect(formatted).toContain('Line 5');
      expect(formatted).toContain('partial');
      expect(formatted).toContain('2/4');  // covered/total conditions
    });
  });
});
