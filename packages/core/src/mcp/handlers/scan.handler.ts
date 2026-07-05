/**
 * Scan Handler
 *
 * MCP handler for sonar_scan_project tool.
 * Uses dependency injection for testability.
 */

import { ScanResultProcessor, ScanRecoverableError } from '../../core/scanning/index.js';
import { ScanFallbackService } from '../../core/scanning/fallback/index.js';
import { SonarQubeScanner } from '../../sonar/scanner/index.js';
import { IProjectManager, ISonarAdmin } from '../../infrastructure/interfaces/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { validateInput, SonarScanProjectSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse, ScanResult } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for scan handler
 */
export interface ScanArgs {
  projectPath?: string;
  severityFilter?: string[];
  typeFilter?: string[];
  autoSetup?: boolean;
}

/**
 * Injectable scan handler class
 */
/**
 * Handle scan project MCP tool request
 *
 */
export async function handleScanProject(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarScanProjectSchema, args, 'sonar_scan_project');

  // Build generic scanner params; Sonar-specific filters travel in options.
  const scanParams = {
    projectPath: validatedArgs.projectPath ?? process.cwd(),
    options: {
      severityFilter: validatedArgs.severityFilter,
      typeFilter: validatedArgs.typeFilter,
      autoSetup: validatedArgs.autoSetup,
    },
  };

  // Initialize dependencies (legacy approach)
  const projectManager = new ProjectManager();
  const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
  const sonarToken = process.env.SONAR_TOKEN;
  const sonarAdmin = new SonarAdmin(sonarUrl, sonarToken);

  // Route the scan through the IScanner abstraction (see ScanHandler above).
  const scanner = new SonarQubeScanner(projectManager, sonarAdmin);

  try {
    const iresult = await scanner.scan(scanParams, correlationId);

    // Format result as text summary
    const summary = ScanResultProcessor.formatAsTextSummary(iresult.rawOutput as ScanResult);

    return {
      content: [{ type: 'text', text: summary }],
    };
  } catch (error) {
    // Handle recoverable scan errors with fallback information
    if (error instanceof ScanRecoverableError) {
      const fallbackService = new ScanFallbackService();
      const formattedOutput = fallbackService.formatForOutput(error.fallbackAnalysis);

      return {
        content: [{ type: 'text', text: formattedOutput }],
        isError: true,
      };
    }

    // Re-throw other errors
    throw error;
  }
}
