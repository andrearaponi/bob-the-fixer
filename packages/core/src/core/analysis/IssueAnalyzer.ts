/**
 * IssueAnalyzer Service
 * Analyzes and provides detailed information about SonarQube issues
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarQubeClient } from '../../sonar/index.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import {
  buildIssueDetailsReport,
  buildIssueBasicInfo,
  buildIssueLocation,
  buildRuleInformation,
  buildSourceContext,
  buildFileMetrics,
  buildAdditionalFields,
  buildNextSteps,
  detectLanguageFromFile} from '../../shared/utils/issue-details-utils.js';

export interface IssueDetailsOptions {
  issueKey: string;
  contextLines?: number;
  includeRuleDetails?: boolean;
  includeCodeExamples?: boolean;
  includeFilePath?: boolean;

  // NEW: richer context
  includeFileHeader?: boolean;
  headerMaxLines?: number;

  includeDataFlow?: 'auto' | boolean;
  maxFlows?: number;
  maxFlowSteps?: number;
  flowContextLines?: number;

  includeSimilarFixed?: boolean;
  maxSimilarIssues?: number;

  includeRelatedTests?: boolean;
  includeCoverageHints?: boolean;

  includeScmHints?: boolean;
}

export interface IssueDetails {
  key: string;
  severity: string;
  type: string;
  message: string;
  component: string;
  line?: number;
  status: string;
  author?: string;
  rule: string;
  effort?: string;
  creationDate: string;
  updateDate?: string;
  tags?: string[];
  ruleDetails?: any;
  sourceContext?: string;
  filePath?: string;
}

export class IssueAnalyzer {
  private readonly logger: StructuredLogger;

  constructor(private readonly projectManager: ProjectManager) {
    this.logger = getLogger();
  }

  /**
   * Get detailed information about a specific issue
   */
  async getIssueDetails(
    options: IssueDetailsOptions,
    correlationId?: string
  ): Promise<string> {
    this.logger.info('Getting issue details', { issueKey: options.issueKey }, correlationId);

    // Get configuration and create client
    const config = await this.projectManager.getOrCreateConfig();
    const projectContext = await this.projectManager.analyzeProject();
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    const includeDataFlow = options.includeDataFlow ?? 'auto';
    const needsExtendedFields = includeDataFlow !== false;

    const issue = await sonarClient.getIssueByKey(options.issueKey, {
      includeExtendedFields: needsExtendedFields
    });

    if (!issue) throw new Error(`Issue ${options.issueKey} not found`);

    // Get extended source context
    const contextLines = options.contextLines ?? 10;
    const issueLine = issue.line ?? 1;
    const context = await sonarClient.getSourceContext(issue.component, issueLine, contextLines);

    // Optional: include file header (imports/signature) to improve fixability
    const includeFileHeader = options.includeFileHeader ?? true;
    const headerMaxLines = options.headerMaxLines ?? 60;
    let fileHeader = '';
    if (includeFileHeader) {
      const headerLines = await sonarClient.getSourceLines(
        issue.component,
        1,
        headerMaxLines,
        { bestEffort: true }
      );
      fileHeader = this.formatSourceLines(headerLines, { includeLineNumbers: true });
    }

    // Optional: data flow (taint path) for security-relevant issues, when available
    let dataFlowSection = '';
    const hasFlows = Array.isArray(issue.flows) && issue.flows.length > 0;
    const shouldIncludeFlow =
      includeDataFlow === true || (includeDataFlow === 'auto' && hasFlows);
    if (shouldIncludeFlow && hasFlows) {
      dataFlowSection = await this.buildDataFlowSection(issue, sonarClient, config, {
        maxFlows: options.maxFlows ?? 3,
        maxFlowSteps: options.maxFlowSteps ?? 12,
        flowContextLines: options.flowContextLines ?? 3
      });
    }

    // Optional: similar FIXED issues (metadata-only)
    let similarFixedSection = '';
    if (options.includeSimilarFixed) {
      try {
        const maxSimilar = options.maxSimilarIssues ?? 3;
        const similar = await sonarClient.getSimilarFixedIssues(issue.rule, maxSimilar + 1);
        const filtered = (similar ?? []).filter((i: any) => i?.key && i.key !== issue.key).slice(0, maxSimilar);
        similarFixedSection = this.buildSimilarFixedSection(issue.rule, filtered, config);
      } catch (error: any) {
        this.logger.debug('Could not fetch similar fixed issues', { rule: issue.rule });
      }
    }

    const includeRelatedTests = options.includeRelatedTests ?? false;
    const includeCoverageHints = options.includeCoverageHints ?? includeRelatedTests;
    const includeScmHints = options.includeScmHints ?? false;

    // Fetch line metadata once if needed for coverage/scm hints
    let issueLineMeta: any | undefined;
    if (includeCoverageHints || includeScmHints) {
      try {
        const metaLines = await sonarClient.getLineCoverage(issue.component, issueLine, issueLine);
        issueLineMeta = metaLines.find((l: any) => l?.line === issueLine) ?? metaLines[0];
      } catch (error: any) {
        this.logger.debug('Could not fetch line metadata', { component: issue.component, line: issueLine });
        issueLineMeta = undefined;
      }
    }

    // Optional: related tests (local heuristics + Sonar fallback) + coverage hints
    let relatedTestsSection = '';
    if (includeRelatedTests) {
      relatedTestsSection = await this.buildRelatedTestsSection(issue, config, issueLineMeta, includeCoverageHints, sonarClient);
    }

    // Optional: SCM hints (author/date/revision) when available
    let scmHintsSection = '';
    if (includeScmHints) {
      scmHintsSection = this.buildScmHintsSection(issueLine, issueLineMeta);
    }

    // Get file/component details for metrics
    let componentDetails: any = null;
    try {
      componentDetails = await sonarClient.getComponentDetails(issue.component);
    } catch (error: any) {
      // Component details are optional, don't fail if not available
      this.logger.debug('Could not fetch component details', { component: issue.component });
    }

    // Build comprehensive issue details using extracted utility functions
    const report = await buildIssueDetailsReport(
      issue,
      context,
      { ...config, projectManager: this.projectManager },
      sonarClient,
      {
        includeRuleDetails: options.includeRuleDetails ?? true,
        includeCodeExamples: options.includeCodeExamples ?? true,
        includeFilePath: options.includeFilePath ?? true,
        contextLines,
        componentDetails,
        fileHeader,
        headerMaxLines,
        dataFlowSection,
        similarFixedSection,
        relatedTestsSection,
        scmHintsSection
      },
      buildIssueBasicInfo,
      buildIssueLocation,
      buildFileMetrics,
      buildRuleInformation,
      buildSourceContext,
      buildAdditionalFields,
      buildNextSteps
    );

    this.logger.info('Issue details retrieved', { issueKey: options.issueKey }, correlationId);

    return report;
  }

  private formatSourceLines(
    lines: Array<{ line?: number; code?: string }>,
    options?: { includeLineNumbers?: boolean }
  ): string {
    if (!Array.isArray(lines) || lines.length === 0) return '';

    if (!options?.includeLineNumbers) {
      return lines.map(l => l.code ?? '').join('\n');
    }

    const maxLine = Math.max(...lines.map(l => l.line ?? 0));
    const width = Math.max(1, String(maxLine).length);

    return lines
      .map(l => `${String(l.line ?? '').padStart(width, ' ')} | ${l.code ?? ''}`)
      .join('\n');
  }

  private async buildDataFlowSection(
    issue: any,
    sonarClient: any,
    config: any,
    options: { maxFlows: number; maxFlowSteps: number; flowContextLines: number }
  ): Promise<string> {
    const flows = Array.isArray(issue.flows) ? issue.flows : [];
    if (flows.length === 0) return '';

    const issueLine = issue.line ?? 1;
    const maxFlows = Math.max(1, options.maxFlows);
    const maxFlowSteps = Math.max(1, options.maxFlowSteps);
    const flowContextLines = Math.max(0, options.flowContextLines);

    const flowsToShow = flows.slice(0, maxFlows);
    let section = `DATA FLOW\n\n`;

    for (let flowIndex = 0; flowIndex < flowsToShow.length; flowIndex++) {
      const flow = flowsToShow[flowIndex];
      const locations = Array.isArray(flow?.locations) ? flow.locations : [];

      const seen = new Set<string>();
      const stepSpecs: Array<{
        component: string;
        line: number;
        msg?: string;
        isPrimary: boolean;
      }> = [];

      for (const loc of locations) {
        if (stepSpecs.length >= maxFlowSteps) break;
        const component = loc?.component;
        const line =
          loc?.textRange?.startLine ??
          loc?.textRange?.endLine ??
          loc?.line;

        if (!component || typeof component !== 'string') continue;
        if (typeof line !== 'number' || !Number.isFinite(line) || line < 1) continue;

        const dedupeKey = `${component}:${line}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const isPrimary = component === issue.component && line === issueLine;
        stepSpecs.push({
          component,
          line,
          msg: loc?.msg,
          isPrimary
        });
      }

      const totalSteps = locations.length;
      const shownSteps = stepSpecs.length;

      section += `Flow ${flowIndex + 1} (showing ${shownSteps}/${totalSteps} steps)\n\n`;

      const stepResults = await Promise.all(
        stepSpecs.map(async (spec) => {
          const from = Math.max(1, spec.line - flowContextLines);
          const to = spec.line + flowContextLines;
          const lines = await sonarClient.getSourceLines(spec.component, from, to, { bestEffort: true });
          return { ...spec, lines };
        })
      );

      for (let stepIndex = 0; stepIndex < stepResults.length; stepIndex++) {
        const step = stepResults[stepIndex];
        const relativePath = step.component.replace(`${config.sonarProjectKey}:`, '');
        const locationLabel = `${relativePath}:${step.line}${step.isPrimary ? ' ← PRIMARY LOCATION' : ''}`;
        const msg = step.msg ? ` — ${step.msg}` : '';

        section += `Step ${stepIndex + 1}: ${locationLabel}${msg}\n`;

        const snippet = this.formatSourceLines(step.lines, { includeLineNumbers: true });
        if (snippet.trim()) {
          const language = detectLanguageFromFile(step.component);
          section += `\`\`\`${language}\n${snippet}\n\`\`\`\n\n`;
        } else {
          section += `(source unavailable)\n\n`;
        }
      }

      if (totalSteps > shownSteps) {
        section += `Omitted ${totalSteps - shownSteps} steps (token budget).\n\n`;
      }
    }

    if (flows.length > flowsToShow.length) {
      section += `Omitted ${flows.length - flowsToShow.length} additional flows (token budget).\n\n`;
    }

    return section;
  }

  private buildSimilarFixedSection(ruleKey: string, issues: any[], config: any): string {
    let section = `SIMILAR FIXED ISSUES\n\n`;
    section += `Rule: \`${ruleKey}\`\n\n`;

    if (!Array.isArray(issues) || issues.length === 0) {
      section += `No similar FIXED issues found in this project.\n\n`;
      return section;
    }

    section += `Found ${issues.length} similar FIXED issues in this project:\n\n`;

    issues.forEach((i, idx) => {
      const relativePath = typeof i.component === 'string'
        ? i.component.replace(`${config.sonarProjectKey}:`, '')
        : 'unknown';
      const line = i.line ?? 'N/A';
      const resolvedAt = i.closeDate ?? i.updateDate;

      section += `${idx + 1}. ${relativePath}:${line}`;
      if (resolvedAt) section += ` (resolved ${resolvedAt})`;
      section += `\n`;
      if (i.key) section += `   Key: \`${i.key}\`\n`;
      if (i.message) section += `   Message: ${i.message}\n`;
      section += `\n`;
    });

    return section;
  }

  private async buildRelatedTestsSection(
    issue: any,
    config: any,
    issueLineMeta: any | undefined,
    includeCoverageHints: boolean,
    sonarClient: any
  ): Promise<string> {
    const workingDir = this.projectManager.getWorkingDirectory();
    const relativeSourcePath = String(issue.component ?? '').replace(`${config.sonarProjectKey}:`, '');
    const absoluteSourcePath = path.join(workingDir, relativeSourcePath);
    const baseName = this.getFileBaseName(absoluteSourcePath);

    let testFiles = await this.findRelatedTestFiles(absoluteSourcePath);

    // Fallback: ask SonarQube for unit test files (best-effort) and filter by base name
    if (testFiles.length === 0) {
      const sonarTests = await sonarClient.getProjectTestFiles?.(200);
      if (Array.isArray(sonarTests) && sonarTests.length > 0) {
        const baseLower = baseName.toLowerCase();
        const matches = sonarTests
          .map((t: any) => t?.path ?? t?.name)
          .filter((p: any) => typeof p === 'string' && p.toLowerCase().includes(baseLower))
          .slice(0, 5)
          .map((p: string) => path.join(workingDir, p));
        testFiles = Array.from(new Set(matches));
      }
    }

    let section = `RELATED TESTS\n\n`;

    if (testFiles.length === 0) {
      section += `No related tests found by heuristics.\n\n`;
    } else {
      section += `Found ${testFiles.length} candidate test files (best-effort):\n\n`;
      for (const testFile of testFiles.slice(0, 10)) {
        section += `- \`${path.relative(workingDir, testFile)}\`\n`;
      }
      section += `\n`;
    }

    if (includeCoverageHints) {
      section += `COVERAGE HINTS\n\n`;

      const line = issue.line ?? 1;
      const lineHits = issueLineMeta?.lineHits;
      const conditions = issueLineMeta?.conditions;
      const coveredConditions = issueLineMeta?.coveredConditions;

      if (typeof lineHits === 'number') {
        if (lineHits === 0) {
          section += `- Line ${line}: ❌ NOT COVERED (lineHits=0)\n`;
          section += `  ⚠️ The issue is in uncovered code. Consider adding tests.\n`;
        } else {
          section += `- Line ${line}: ✅ Covered (lineHits=${lineHits})\n`;
        }
      } else {
        section += `- Line ${line}: Coverage data not available (not executable or coverage not configured)\n`;
      }

      if (typeof conditions === 'number' && typeof coveredConditions === 'number' && conditions > 0) {
        section += `- Branch coverage: ${coveredConditions}/${conditions}\n`;
      }

      section += `\n`;
    }

    return section;
  }

  private buildScmHintsSection(issueLine: number, issueLineMeta: any | undefined): string {
    let section = `SCM HINTS\n\n`;

    const author = issueLineMeta?.scmAuthor;
    const date = issueLineMeta?.scmDate;
    const revision = issueLineMeta?.scmRevision;

    if (!author && !date && !revision) {
      section += `SCM info not available for line ${issueLine} (SCM not configured or not provided by SonarQube).\n\n`;
      return section;
    }

    section += `Line ${issueLine} last modified`;
    if (author) section += ` by ${author}`;
    if (date) section += ` on ${date}`;
    if (revision) section += ` (revision ${revision})`;
    section += `\n\n`;

    return section;
  }

  private getFileBaseName(filePath: string): string {
    const fileName = path.basename(filePath);
    if (fileName.endsWith('.d.ts')) return fileName.slice(0, -'.d.ts'.length);
    const ext = path.extname(fileName);
    return ext ? fileName.slice(0, -ext.length) : fileName;
  }

  private async findRelatedTestFiles(sourceAbsolutePath: string): Promise<string[]> {
    const base = this.getFileBaseName(sourceAbsolutePath);
    if (!base) return [];

    const baseLower = base.toLowerCase();
    const sourceDir = path.dirname(sourceAbsolutePath);
    const parentDir = path.dirname(sourceDir);

    const candidateDirs = [
      sourceDir,
      path.join(sourceDir, '__tests__'),
      path.join(sourceDir, 'test'),
      path.join(sourceDir, 'tests'),
      path.join(sourceDir, 'spec'),
      path.join(parentDir, '__tests__'),
      path.join(parentDir, 'test'),
      path.join(parentDir, 'tests'),
      path.join(parentDir, 'spec'),
    ];

    const uniqueDirs = Array.from(new Set(candidateDirs));
    const matches: string[] = [];
    const seen = new Set<string>();

    for (const dir of uniqueDirs) {
      let entries: string[] = [];
      try {
        entries = await fs.readdir(dir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const lower = entry.toLowerCase();
        const isMatch =
          lower.includes(`${baseLower}.test.`) ||
          lower.includes(`${baseLower}.spec.`) ||
          lower.startsWith(`${baseLower}test.`) ||
          lower.startsWith(`${baseLower}tests.`) ||
          lower.startsWith(`${baseLower}spec.`) ||
          lower.startsWith(`${baseLower}specs.`);

        if (!isMatch) continue;

        const fullPath = path.join(dir, entry);
        if (seen.has(fullPath)) continue;
        seen.add(fullPath);
        matches.push(fullPath);

        if (matches.length >= 10) return matches;
      }
    }

    return matches;
  }
}
