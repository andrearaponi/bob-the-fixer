/**
 * CoverageAnalyzer Service
 * Analyzes code coverage data from SonarQube and identifies coverage gaps.
 *
 * Key responsibilities:
 * - Identify uncovered code blocks (consecutive lines with lineHits === 0)
 * - Identify partial branch coverage (conditions not fully covered)
 * - Aggregate consecutive uncovered lines into "gaps" for cleaner LLM prompts
 * - Generate human-readable summaries for AI-assisted test generation
 */

import { SonarLineCoverage, CoverageGap, CoverageAnalysisResult } from '../../sonar/types.js';

export interface CoverageGapOptions {
  minGapSize?: number;  // Minimum number of consecutive lines to report as a gap
  includePartialBranch?: boolean;  // Include partial branch coverage as gaps
}

export class CoverageAnalyzer {
  /**
   * Find all coverage gaps in the given lines of code.
   * A gap is either:
   * 1. Consecutive lines with lineHits === 0 (uncovered)
   * 2. Lines with partial branch coverage (conditions > coveredConditions)
   */
  findCoverageGaps(
    lines: SonarLineCoverage[],
    options: CoverageGapOptions = {}
  ): CoverageGap[] {
    const { minGapSize = 1, includePartialBranch = true } = options;
    const gaps: CoverageGap[] = [];

    // First, find all uncovered line gaps
    const uncoveredGaps = this.findUncoveredGaps(lines);

    // Filter by minimum gap size
    const filteredUncoveredGaps = uncoveredGaps.filter(
      gap => gap.lines.length >= minGapSize
    );
    gaps.push(...filteredUncoveredGaps);

    // Then, find partial branch coverage gaps
    if (includePartialBranch) {
      const partialBranchGaps = this.findPartialBranchGaps(lines);
      // Only add if not already included in an uncovered gap
      for (const partialGap of partialBranchGaps) {
        const alreadyIncluded = gaps.some(
          gap => partialGap.startLine >= gap.startLine && partialGap.endLine <= gap.endLine
        );
        if (!alreadyIncluded) {
          gaps.push(partialGap);
        }
      }
    }

    // Sort gaps by start line
    gaps.sort((a, b) => a.startLine - b.startLine);

    return gaps;
  }

  /**
   * Find gaps of consecutive uncovered lines (lineHits === 0)
   */
  private findUncoveredGaps(lines: SonarLineCoverage[]): CoverageGap[] {
    const gaps: CoverageGap[] = [];
    let currentGapLines: SonarLineCoverage[] = [];
    let lastLineNumber = -2;  // Initialize to impossible value

    for (const line of lines) {
      // Skip non-executable lines (no lineHits property)
      if (line.lineHits === undefined) {
        // If we were building a gap, end it
        if (currentGapLines.length > 0) {
          gaps.push(this.createGap(currentGapLines, 'uncovered'));
          currentGapLines = [];
        }
        lastLineNumber = line.line;
        continue;
      }

      // Check if this is an uncovered line
      if (line.lineHits === 0) {
        // Check if consecutive with previous uncovered line
        if (currentGapLines.length === 0 || line.line === lastLineNumber + 1) {
          currentGapLines.push(line);
        } else {
          // Gap in line numbers - save current gap and start new one
          if (currentGapLines.length > 0) {
            gaps.push(this.createGap(currentGapLines, 'uncovered'));
          }
          currentGapLines = [line];
        }
        lastLineNumber = line.line;
      } else {
        // Covered line - end current gap if any
        if (currentGapLines.length > 0) {
          gaps.push(this.createGap(currentGapLines, 'uncovered'));
          currentGapLines = [];
        }
        lastLineNumber = line.line;
      }
    }

    // Don't forget the last gap
    if (currentGapLines.length > 0) {
      gaps.push(this.createGap(currentGapLines, 'uncovered'));
    }

    return gaps;
  }

  /**
   * Find lines with partial branch coverage
   */
  private findPartialBranchGaps(lines: SonarLineCoverage[]): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    for (const line of lines) {
      // Check for partial branch coverage
      if (
        line.conditions !== undefined &&
        line.coveredConditions !== undefined &&
        line.conditions > 0 &&
        line.coveredConditions < line.conditions &&
        line.lineHits !== undefined &&
        line.lineHits > 0  // Only count as partial if line is actually executed
      ) {
        gaps.push(this.createGap([line], 'partial_branch'));
      }
    }

    return gaps;
  }

  /**
   * Create a CoverageGap object from a list of lines
   */
  private createGap(lines: SonarLineCoverage[], type: 'uncovered' | 'partial_branch'): CoverageGap {
    const codeSnippet = lines.map(l => l.code).join('\n');

    return {
      startLine: lines[0].line,
      endLine: lines[lines.length - 1].line,
      lines,
      type,
      codeSnippet
    };
  }

  /**
   * Analyze coverage for a component and return comprehensive statistics
   */
  analyzeCoverage(componentKey: string, lines: SonarLineCoverage[]): CoverageAnalysisResult {
    const gaps = this.findCoverageGaps(lines);

    // Calculate statistics
    const totalLines = lines.length;
    const executableLines = lines.filter(l => l.lineHits !== undefined).length;
    const coveredLines = lines.filter(l => l.lineHits !== undefined && l.lineHits > 0).length;
    const uncoveredLines = executableLines - coveredLines;

    // Calculate coverage percentage (avoid division by zero)
    const coveragePercentage = executableLines === 0
      ? 100
      : Math.round((coveredLines / executableLines) * 100);

    // Generate human-readable summary
    const summary = this.generateSummary(componentKey, {
      totalLines,
      executableLines,
      coveredLines,
      uncoveredLines,
      coveragePercentage,
      gaps
    });

    return {
      componentKey,
      totalLines,
      executableLines,
      coveredLines,
      uncoveredLines,
      coveragePercentage,
      gaps,
      summary
    };
  }

  /**
   * Generate a human-readable summary for LLM consumption
   */
  private generateSummary(
    componentKey: string,
    stats: Omit<CoverageAnalysisResult, 'componentKey' | 'summary'>
  ): string {
    const lines: string[] = [];

    lines.push(`## Coverage Analysis: ${componentKey}`);
    lines.push('');
    lines.push(`**Coverage: ${stats.coveragePercentage}%** (${stats.coveredLines}/${stats.executableLines} executable lines)`);
    lines.push('');

    if (stats.gaps.length === 0) {
      lines.push('✅ **All executable lines are covered!** No gaps found.');
    } else {
      const uncoveredGaps = stats.gaps.filter(g => g.type === 'uncovered');
      const partialGaps = stats.gaps.filter(g => g.type === 'partial_branch');

      if (uncoveredGaps.length > 0) {
        lines.push(`### Uncovered Code (${uncoveredGaps.length} gap${uncoveredGaps.length > 1 ? 's' : ''})`);
        lines.push('');
        for (const gap of uncoveredGaps) {
          lines.push(this.formatGapForLLM(gap));
          lines.push('');
        }
      }

      if (partialGaps.length > 0) {
        lines.push(`### Partial Branch Coverage (${partialGaps.length} gap${partialGaps.length > 1 ? 's' : ''})`);
        lines.push('');
        for (const gap of partialGaps) {
          lines.push(this.formatGapForLLM(gap));
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Format a single gap in a way that's useful for LLM prompts
   */
  formatGapForLLM(gap: CoverageGap): string {
    const lines: string[] = [];

    // Line range
    const lineRange = gap.startLine === gap.endLine
      ? `Line ${gap.startLine}`
      : `Lines ${gap.startLine}-${gap.endLine}`;

    if (gap.type === 'uncovered') {
      lines.push(`**${lineRange}** (uncovered)`);
    } else {
      // Partial branch - include condition info
      const condLine = gap.lines[0];
      const conditions = condLine.conditions ?? 0;
      const covered = condLine.coveredConditions ?? 0;
      lines.push(`**${lineRange}** (partial branch coverage: ${covered}/${conditions} conditions covered)`);
    }

    // Add code snippet
    if (gap.codeSnippet) {
      lines.push('```');
      lines.push(gap.codeSnippet);
      lines.push('```');
    }

    return lines.join('\n');
  }
}
