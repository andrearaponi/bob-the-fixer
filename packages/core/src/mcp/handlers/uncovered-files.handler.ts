/**
 * Thin MCP handler for sonar_get_uncovered_files
 * Returns list of files with coverage below target threshold
 * Handles projects without coverage data by providing setup instructions
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarQubeClient } from '../../sonar/index.js';
import { validateInput, SonarGetUncoveredFilesSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { FilesWithCoverageGaps, FileWithCoverage } from '../../sonar/types.js';

/**
 * Handle get uncovered files MCP tool request
 */
export async function handleGetUncoveredFiles(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarGetUncoveredFilesSchema, args, 'sonar_get_uncovered_files');

  // Initialize dependencies
  const projectManager = new ProjectManager();
  const config = await projectManager.getOrCreateConfig();
  const projectContext = await projectManager.analyzeProject();

  const sonarClient = new SonarQubeClient(
    config.sonarUrl,
    config.sonarToken,
    config.sonarProjectKey,
    projectContext
  );

  // Fetch files with coverage gaps
  const result = await sonarClient.getFilesWithCoverageGaps({
    targetCoverage: validatedArgs.targetCoverage,
    maxFiles: validatedArgs.maxFiles,
    sortBy: validatedArgs.sortBy,
    includeNoCoverageData: validatedArgs.includeNoCoverageData
  });

  // Generate response based on coverage state
  const summary = generateCoverageSummary(result, validatedArgs.targetCoverage ?? 100);

  return {
    content: [{ type: 'text', text: summary }]
  };
}

/**
 * Generate human-readable coverage summary for LLM consumption
 */
function generateCoverageSummary(result: FilesWithCoverageGaps, targetCoverage: number): string {
  const lines: string[] = [];

  // Check if project has coverage data
  if (!result.hasCoverageReport) {
    return generateNoCoverageDataMessage(result);
  }

  // Header with coverage status
  lines.push('## Coverage Analysis Results\n');
  lines.push(`**Target Coverage:** ${targetCoverage}%`);
  lines.push(`**Average Coverage:** ${result.averageCoverage}%`);
  lines.push(`**Files Below Target:** ${result.filesWithGaps} of ${result.totalFiles}\n`);

  if (result.filesWithGaps === 0) {
    lines.push('All files meet the target coverage threshold.\n');
    return lines.join('\n');
  }

  // Group files by priority
  const critical = result.files.filter(f => f.priority === 'critical');
  const high = result.files.filter(f => f.priority === 'high');
  const medium = result.files.filter(f => f.priority === 'medium');
  const low = result.files.filter(f => f.priority === 'low');

  // Critical priority files (0% coverage)
  if (critical.length > 0) {
    lines.push('### CRITICAL Priority (0% Coverage)\n');
    lines.push('These files have **no test coverage** and should be addressed first:\n');
    for (const file of critical) {
      lines.push(formatFileEntry(file));
    }
    lines.push('');
  }

  // High priority files
  if (high.length > 0) {
    lines.push('### HIGH Priority (<30% Coverage or >100 Uncovered Lines)\n');
    for (const file of high) {
      lines.push(formatFileEntry(file));
    }
    lines.push('');
  }

  // Medium priority files
  if (medium.length > 0) {
    lines.push('### MEDIUM Priority (30-60% Coverage)\n');
    for (const file of medium) {
      lines.push(formatFileEntry(file));
    }
    lines.push('');
  }

  // Low priority files
  if (low.length > 0) {
    lines.push('### LOW Priority (>60% Coverage)\n');
    for (const file of low) {
      lines.push(formatFileEntry(file));
    }
    lines.push('');
  }

  // Files without coverage data
  if (result.filesWithoutCoverageData > 0) {
    lines.push(`### Files Without Coverage Data: ${result.filesWithoutCoverageData}\n`);
    if (result.filesNeedingCoverageSetup.length > 0) {
      lines.push('The following files may need coverage setup:');
      for (const path of result.filesNeedingCoverageSetup.slice(0, 10)) {
        lines.push(`- ${path}`);
      }
      if (result.filesNeedingCoverageSetup.length > 10) {
        lines.push(`- ... and ${result.filesNeedingCoverageSetup.length - 10} more`);
      }
      lines.push('');
    }
  }

  // Usage hint
  lines.push('---');
  lines.push('**Next Step:** Use `sonar_get_coverage_gaps` with a file\'s component key to see specific uncovered lines.');

  return lines.join('\n');
}

/**
 * Format a single file entry for display
 */
function formatFileEntry(file: FileWithCoverage): string {
  const coverageBar = generateCoverageBar(file.coverage);
  return `- **${file.path}** ${coverageBar} ${file.coverage}% (${file.uncoveredLines} uncovered lines)`;
}

/**
 * Generate a visual coverage bar
 */
function generateCoverageBar(coverage: number): string {
  const filled = Math.round(coverage / 10);
  const empty = 10 - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

/**
 * Generate message when project has no coverage data
 */
function generateNoCoverageDataMessage(result: FilesWithCoverageGaps): string {
  const lines: string[] = [];

  lines.push('## No Coverage Data Found\n');
  lines.push('This project doesn\'t have coverage reports uploaded to SonarQube yet.\n');
  lines.push('### To Enable Coverage Tracking\n');
  lines.push('**1. Run tests with coverage enabled:**\n');
  lines.push('```bash');
  lines.push('# JavaScript/TypeScript (Vitest)');
  lines.push('npm run test:coverage');
  lines.push('');
  lines.push('# JavaScript/TypeScript (Jest)');
  lines.push('npm test -- --coverage');
  lines.push('');
  lines.push('# Java (Maven with JaCoCo)');
  lines.push('mvn test jacoco:report');
  lines.push('');
  lines.push('# Java (Gradle with JaCoCo)');
  lines.push('gradle test jacocoTestReport');
  lines.push('');
  lines.push('# Python (pytest-cov)');
  lines.push('pytest --cov=src --cov-report=xml');
  lines.push('');
  lines.push('# Go');
  lines.push('go test -coverprofile=coverage.out ./...');
  lines.push('```\n');
  lines.push('**2. Re-scan with coverage:**');
  lines.push('```');
  lines.push('sonar_scan_project');
  lines.push('```');
  lines.push('Coverage reports will be automatically detected and uploaded.\n');
  lines.push('**3. Run this tool again** to see coverage gaps.\n');

  if (result.totalFiles > 0) {
    lines.push('---');
    lines.push(`**Files Found:** ${result.totalFiles} source files in project`);
    if (result.filesNeedingCoverageSetup.length > 0) {
      lines.push('\n**Sample Files:**');
      for (const path of result.filesNeedingCoverageSetup.slice(0, 5)) {
        lines.push(`- ${path}`);
      }
      if (result.filesNeedingCoverageSetup.length > 5) {
        lines.push(`- ... and ${result.filesNeedingCoverageSetup.length - 5} more`);
      }
    }
  }

  return lines.join('\n');
}
