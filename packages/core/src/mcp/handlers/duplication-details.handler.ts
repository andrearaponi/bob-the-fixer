/**
 * Duplication Details Handler
 *
 * MCP handler for sonar_get_duplication_details tool.
 * Provides detailed duplication analysis for a specific file.
 */

import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarQubeClient } from '../../sonar/index.js';
import { validateInput, SonarGetDuplicationDetailsSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for duplication details handler
 */
export interface DuplicationDetailsArgs {
  fileKey: string;
  includeRecommendations?: boolean;
}

/**
 * Injectable duplication details handler class
 */
/**
 * Build a human-readable duplication details report
 */
function buildDuplicationDetailsReport(
  fileKey: string,
  details: any,
  includeRecommendations: boolean,
  projectPath?: string
): string {
  let report = `DUPLICATION DETAILS\n\n`;
  report += `File: ${fileKey}\n`;

  // Extract file name from key
  const fileName = fileKey.includes(':') ? fileKey.split(':').pop() : fileKey;

  // Add absolute path if available
  if (projectPath && fileName) {
    const absolutePath = `${projectPath}/${fileName}`;
    report += `Path: ${absolutePath}\n`;
  }
  report += '\n';

  // Check if there are any duplications
  if (!details.duplications || details.duplications.length === 0) {
    report += 'No duplications found in this file.\n';
    return report;
  }

  report += `Total Duplicate Groups: ${details.duplications.length}\n\n`;

  // Process each duplication group
  report += `DUPLICATE BLOCKS:\n`;
  report += `${'─'.repeat(60)}\n\n`;

  details.duplications.forEach((group: any, groupIndex: number) => {
    report += `Group ${groupIndex + 1}:\n`;

    // Track total lines in this group
    let totalLines = 0;
    const affectedFiles: string[] = [];

    group.blocks.forEach((block: any, blockIndex: number) => {
      const fileRef = block._ref;
      const fileInfo = details.files?.[fileRef];
      const fileName = fileInfo?.name || fileRef;
      const filePath = fileInfo?.key || fileRef;

      totalLines += block.size;
      if (!affectedFiles.includes(filePath)) {
        affectedFiles.push(filePath);
      }

      report += `  Block ${blockIndex + 1}:\n`;
      report += `    File: ${fileName}\n`;
      report += `    Lines: ${block.from} - ${block.from + block.size - 1} (${block.size} lines)\n`;
      if (fileInfo?.key && fileInfo.key !== fileKey) {
        report += `    Key: ${fileInfo.key}\n`;
      }
    });

    report += `  Summary: ${totalLines} total duplicated lines across ${affectedFiles.length} location(s)\n`;
    report += '\n';
  });

  // Files reference section
  if (details.files && Object.keys(details.files).length > 0) {
    report += `AFFECTED FILES:\n`;
    report += `${'─'.repeat(60)}\n\n`;

    Object.entries(details.files).forEach(([ref, fileInfo]: [string, any]) => {
      report += `  [${ref}] ${fileInfo.name}\n`;
      report += `       Project: ${fileInfo.projectName}\n`;
      report += `       Key: ${fileInfo.key}\n\n`;
    });
  }

  // Recommendations section
  if (includeRecommendations) {
    report += `REFACTORING RECOMMENDATIONS:\n`;
    report += `${'─'.repeat(60)}\n\n`;

    const numGroups = details.duplications.length;
    const hasExternalDups = Object.keys(details.files || {}).length > 1;

    if (numGroups >= 3) {
      report += `🔴 HIGH PRIORITY: This file has ${numGroups} duplicate groups.\n`;
      report += `   Consider extracting common code into shared utilities or base classes.\n\n`;
    } else if (numGroups >= 1) {
      report += `🟡 MEDIUM PRIORITY: This file has ${numGroups} duplicate group(s).\n`;
      report += `   Review the duplicated code to determine if extraction is beneficial.\n\n`;
    }

    if (hasExternalDups) {
      report += `📁 CROSS-FILE DUPLICATION DETECTED:\n`;
      report += `   The duplications span multiple files. Consider:\n`;
      report += `   • Creating a shared utility module\n`;
      report += `   • Extracting to a common base class\n`;
      report += `   • Using composition or mixins\n\n`;
    }

    // General recommendations
    report += `GENERAL TIPS:\n`;
    report += `• Small duplications (< 10 lines): Consider if extraction adds value\n`;
    report += `• Large duplications (> 20 lines): Strong candidate for extraction\n`;
    report += `• Identical logic with different data: Use parameterization\n`;
    report += `• Similar patterns: Consider template method or strategy pattern\n`;
  }

  return report;
}

/**
 * Handle get duplication details MCP tool request
 *
 */
export async function handleGetDuplicationDetails(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  try {
    // Validate input
    const validatedArgs = validateInput(SonarGetDuplicationDetailsSchema, args, 'sonar_get_duplication_details');

    // Initialize dependencies (legacy approach)
    const projectManager = new ProjectManager();
    const config = await projectManager.getOrCreateConfig();
    const projectContext = await projectManager.analyzeProject();

    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    // Get duplication details from SonarQube
    const details = await sonarClient.getDuplicationDetails(validatedArgs.fileKey);

    // Build report
    const report = buildDuplicationDetailsReport(
      validatedArgs.fileKey,
      details,
      validatedArgs.includeRecommendations !== false,
      projectContext?.path
    );

    return {
      content: [{ type: 'text', text: report }],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error getting duplication details: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}
