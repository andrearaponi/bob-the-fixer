import { describe, it, expect } from 'vitest';
import { ScanResultProcessor } from './ScanResultProcessor';
import { ScanResult } from '../../shared/types/index';

describe('ScanResultProcessor', () => {
  const mockProjectContext = {
    path: '/test/project',
    name: 'test-project',
    language: ['typescript'],
    languages: ['typescript'],
    frameworks: ['node'],
    testFrameworks: [],
    buildTools: ['npm'],
    buildTool: 'npm',
    hasTests: false,
    configFiles: [],
  };

  const createScanResult = (overrides?: Partial<ScanResult>): ScanResult => ({
    projectKey: 'test-project',
    totalIssues: 5,
    issuesBySeverity: {
      BLOCKER: 1,
      CRITICAL: 2,
      MAJOR: 1,
      MINOR: 1,
    },
    qualityScore: 75,
    topIssues: [
      {
        key: 'issue-1',
        severity: 'BLOCKER',
        type: 'BUG',
        message: 'Null pointer dereference',
        component: 'src/main.ts',
        line: 42,
      },
      {
        key: 'issue-2',
        severity: 'CRITICAL',
        type: 'VULNERABILITY',
        message: 'SQL injection vulnerability',
        component: 'src/db.ts',
        line: 100,
      },
      {
        key: 'issue-3',
        severity: 'CRITICAL',
        type: 'CODE_SMELL',
        message: 'Cognitive complexity too high',
        component: 'src/logic.ts',
        line: 200,
      },
    ],
    projectContext: mockProjectContext,
    ...overrides,
  });

  describe('formatAsTextSummary', () => {
    it('should format scan result as text summary', () => {
      const result = createScanResult();
      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).toContain('SONARQUBE ANALYSIS RESULTS');
      expect(summary).toContain('Project: test-project');
      expect(summary).toContain('Total Issues: 5');
      expect(summary).toContain('BY SEVERITY:');
      expect(summary).toContain('- BLOCKER: 1');
      expect(summary).toContain('- CRITICAL: 2');
      expect(summary).toContain('- MAJOR: 1');
      expect(summary).toContain('- MINOR: 1');
      expect(summary).toContain('Quality Score: 75/100');
      expect(summary).toContain('TOP PRIORITY ISSUES:');
    });

    it('should include top issues in summary', () => {
      const result = createScanResult();
      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).toContain('1. BLOCKER BUG: Null pointer dereference');
      expect(summary).toContain('Issue Key: issue-1');
      expect(summary).toContain('File: src/main.ts (line 42)');
      expect(summary).toContain('2. CRITICAL VULNERABILITY: SQL injection vulnerability');
      expect(summary).toContain('Issue Key: issue-2');
    });

    it('should handle empty top issues', () => {
      const result = createScanResult({ topIssues: [] });
      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).toContain('Project: test-project');
      expect(summary).not.toContain('TOP PRIORITY ISSUES:');
    });

    it('should handle issue without line number', () => {
      const result = createScanResult({
        topIssues: [
          {
            key: 'issue-1',
            severity: 'MAJOR',
            type: 'BUG',
            message: 'Test issue',
            component: 'src/test.ts',
            line: undefined,
          },
        ],
      });
      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).toContain('File: src/test.ts (line unknown)');
    });

    it('should include Java compilation warning for Java projects', () => {
      const result = createScanResult({
        projectContext: {
          ...mockProjectContext,
          language: ['java'],
          buildTool: 'maven',
        },
      });
      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).toContain('NOTE: Java project detected');
      expect(summary).toContain('Compile with: mvn clean compile');
    });

    it('should include Gradle command for Gradle projects', () => {
      const result = createScanResult({
        projectContext: {
          ...mockProjectContext,
          language: ['java'],
          buildTool: 'gradle',
        },
      });
      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).toContain('Compile with: ./gradlew compileJava');
    });

    it('should not include Java warning for non-Java projects', () => {
      const result = createScanResult();
      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).not.toContain('Java project detected');
    });
  });

  describe('formatAsJson', () => {
    it('should format scan result as JSON', () => {
      const result = createScanResult();
      const json = ScanResultProcessor.formatAsJson(result);

      expect(json).toBeTruthy();
      const parsed = JSON.parse(json);
      expect(parsed.projectKey).toBe('test-project');
      expect(parsed.totalIssues).toBe(5);
      expect(parsed.qualityScore).toBe(75);
      expect(parsed.topIssues).toHaveLength(3);
    });

    it('should format with proper indentation', () => {
      const result = createScanResult();
      const json = ScanResultProcessor.formatAsJson(result);

      // Check for proper indentation (2 spaces)
      expect(json).toContain('  "projectKey"');
      expect(json).toContain('  "totalIssues"');
    });

    it('should include all scan result properties', () => {
      const result = createScanResult();
      const json = ScanResultProcessor.formatAsJson(result);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('projectKey');
      expect(parsed).toHaveProperty('totalIssues');
      expect(parsed).toHaveProperty('issuesBySeverity');
      expect(parsed).toHaveProperty('qualityScore');
      expect(parsed).toHaveProperty('topIssues');
      expect(parsed).toHaveProperty('projectContext');
    });
  });

  describe('extractInsights', () => {
    it('should extract insights from scan result', () => {
      const result = createScanResult();
      const insights = ScanResultProcessor.extractInsights(result);

      expect(insights.criticalIssues).toBe(2);
      expect(insights.blockerIssues).toBe(1);
      expect(insights.hasSecurityIssues).toBe(true);
      expect(insights.needsAttention).toBe(true);
    });

    it('should detect no security issues when none present', () => {
      const result = createScanResult({
        topIssues: [
          {
            key: 'issue-1',
            severity: 'MAJOR',
            type: 'BUG',
            message: 'Test bug',
            component: 'src/test.ts',
            line: 10,
          },
        ],
      });
      const insights = ScanResultProcessor.extractInsights(result);

      expect(insights.hasSecurityIssues).toBe(false);
    });

    it('should handle missing severity keys', () => {
      const result = createScanResult({
        issuesBySeverity: {},
      });
      const insights = ScanResultProcessor.extractInsights(result);

      expect(insights.criticalIssues).toBe(0);
      expect(insights.blockerIssues).toBe(0);
    });

    it('should mark as needs attention when blockers present', () => {
      const result = createScanResult({
        issuesBySeverity: { BLOCKER: 1 },
        qualityScore: 90,
      });
      const insights = ScanResultProcessor.extractInsights(result);

      expect(insights.needsAttention).toBe(true);
    });

    it('should mark as needs attention when criticals present', () => {
      const result = createScanResult({
        issuesBySeverity: { CRITICAL: 1 },
        qualityScore: 90,
      });
      const insights = ScanResultProcessor.extractInsights(result);

      expect(insights.needsAttention).toBe(true);
    });

    it('should mark as needs attention when quality score low', () => {
      const result = createScanResult({
        issuesBySeverity: {},
        qualityScore: 50,
      });
      const insights = ScanResultProcessor.extractInsights(result);

      expect(insights.needsAttention).toBe(true);
    });

    it('should not need attention when all metrics good', () => {
      const result = createScanResult({
        issuesBySeverity: { MINOR: 2 },
        qualityScore: 85,
        topIssues: [],
      });
      const insights = ScanResultProcessor.extractInsights(result);

      expect(insights.needsAttention).toBe(false);
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend fixing blocker issues', () => {
      const result = createScanResult({
        issuesBySeverity: { BLOCKER: 2 },
      });
      const recommendations = ScanResultProcessor.generateRecommendations(result);

      expect(recommendations).toContain('🚨 2 BLOCKER issues found - these should be fixed immediately');
    });

    it('should recommend fixing critical issues', () => {
      const result = createScanResult({
        issuesBySeverity: { CRITICAL: 3 },
      });
      const recommendations = ScanResultProcessor.generateRecommendations(result);

      expect(recommendations).toContain('⚠️ 3 CRITICAL issues found - high priority for fixing');
    });

    it('should recommend reviewing security issues', () => {
      const result = createScanResult({
        topIssues: [
          {
            key: 'issue-1',
            severity: 'CRITICAL',
            type: 'VULNERABILITY',
            message: 'Security issue',
            component: 'src/test.ts',
            line: 10,
          },
        ],
      });
      const recommendations = ScanResultProcessor.generateRecommendations(result);

      expect(recommendations).toContain('🔒 Security vulnerabilities detected - review and fix as soon as possible');
    });

    it('should recommend improving quality when score is low', () => {
      const result = createScanResult({
        qualityScore: 50,
      });
      const recommendations = ScanResultProcessor.generateRecommendations(result);

      expect(recommendations).toContain('📉 Quality score is low (50/100) - focus on reducing technical debt');
    });

    it('should congratulate on good quality score', () => {
      const result = createScanResult({
        qualityScore: 85,
        issuesBySeverity: {},
        topIssues: [],
      });
      const recommendations = ScanResultProcessor.generateRecommendations(result);

      expect(recommendations).toContain('✨ Good quality score (85/100) - keep up the good work!');
    });

    it('should celebrate when no issues found', () => {
      const result = createScanResult({
        totalIssues: 0,
        issuesBySeverity: {},
        topIssues: [],
      });
      const recommendations = ScanResultProcessor.generateRecommendations(result);

      expect(recommendations).toContain('🎉 No issues found - excellent code quality!');
    });

    it('should generate multiple recommendations when multiple issues', () => {
      const result = createScanResult({
        issuesBySeverity: { BLOCKER: 1, CRITICAL: 2 },
        qualityScore: 50,
        topIssues: [
          {
            key: 'issue-1',
            severity: 'CRITICAL',
            type: 'VULNERABILITY',
            message: 'Security issue',
            component: 'src/test.ts',
            line: 10,
          },
        ],
      });
      const recommendations = ScanResultProcessor.generateRecommendations(result);

      expect(recommendations.length).toBeGreaterThanOrEqual(4);
      expect(recommendations.some(r => r.includes('BLOCKER'))).toBe(true);
      expect(recommendations.some(r => r.includes('CRITICAL'))).toBe(true);
      expect(recommendations.some(r => r.includes('Security'))).toBe(true);
      expect(recommendations.some(r => r.includes('Quality score'))).toBe(true);
    });

    it('should return empty recommendations for perfect score', () => {
      const result = createScanResult({
        totalIssues: 0,
        issuesBySeverity: {},
        qualityScore: 95,
        topIssues: [],
      });
      const recommendations = ScanResultProcessor.generateRecommendations(result);

      // Should have 2: good quality score + no issues
      expect(recommendations).toHaveLength(2);
      expect(recommendations[0]).toContain('Good quality score');
      expect(recommendations[1]).toContain('No issues found');
    });
  });

  describe('Clean Code Metrics formatting', () => {
    it('should include Clean Code metrics in text summary', () => {
      const result = createScanResult({
        issuesByType: {
          BUG: 22,
          CODE_SMELL: 1639,
          VULNERABILITY: 0,
        },
        cleanCodeMetrics: {
          reliability: 304,
          maintainability: 1638,
          security: 0,
        },
      });

      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).toContain('BY TYPE (Legacy)');
      expect(summary).toContain('🐛 BUG: 22');
      expect(summary).toContain('🧹 CODE_SMELL: 1639');
      expect(summary).toContain('BY SOFTWARE QUALITY IMPACT (Clean Code)');
      expect(summary).toContain('🐛 Reliability: 304');
      expect(summary).toContain('🔧 Maintainability: 1638');
      expect(summary).toContain('🔒 Security: 0');
    });

    it('should handle missing Clean Code metrics', () => {
      const result = createScanResult({
        issuesByType: {
          BUG: 22,
        },
        cleanCodeMetrics: undefined,
      });

      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).toContain('BY TYPE (Legacy)');
      expect(summary).not.toContain('BY SOFTWARE QUALITY IMPACT');
    });

    it('should handle missing issuesByType', () => {
      const result = createScanResult({
        issuesByType: undefined,
        cleanCodeMetrics: {
          reliability: 100,
          maintainability: 200,
          security: 0,
        },
      });

      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).not.toContain('BY TYPE (Legacy)');
      expect(summary).toContain('BY SOFTWARE QUALITY IMPACT (Clean Code)');
      expect(summary).toContain('🐛 Reliability: 100');
    });

    it('should display all zeros for Clean Code metrics when no issues', () => {
      const result = createScanResult({
        totalIssues: 0,
        issuesByType: {},
        cleanCodeMetrics: {
          reliability: 0,
          maintainability: 0,
          security: 0,
        },
      });

      const summary = ScanResultProcessor.formatAsTextSummary(result);

      expect(summary).toContain('🐛 Reliability: 0');
      expect(summary).toContain('🔧 Maintainability: 0');
      expect(summary).toContain('🔒 Security: 0');
    });
  });
});
