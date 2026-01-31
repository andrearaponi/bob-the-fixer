/**
 * Scan Handler
 *
 * MCP handler for sonar_scan_project tool.
 * Uses dependency injection for testability.
 */

import { injectable, inject } from 'tsyringe';
import { ScanOrchestrator, ScanResultProcessor, ScanRecoverableError } from '../../core/scanning/index.js';
import { ScanFallbackService } from '../../core/scanning/fallback/index.js';
import { IProjectManager, ISonarAdmin } from '../../infrastructure/interfaces/index.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { validateInput, SonarScanProjectSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse, ScanParams } from '../../shared/types/index.js';
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
@injectable()
export class ScanHandler implements IHandler<ScanArgs> {
  constructor(
    @inject(TOKENS.ProjectManager) private readonly projectManager: IProjectManager,
    @inject(TOKENS.SonarAdmin) private readonly sonarAdmin: ISonarAdmin
  ) {}

  async handle(args: ScanArgs, correlationId?: string): Promise<MCPResponse> {
    // Validate input
    const validatedArgs = validateInput(SonarScanProjectSchema, args, 'sonar_scan_project');

    // Extract scan parameters
    const scanParams: ScanParams = {
      projectPath: validatedArgs.projectPath,
      severityFilter: validatedArgs.severityFilter as any,
      typeFilter: validatedArgs.typeFilter as any,
      autoSetup: validatedArgs.autoSetup,
    };

    // Create orchestrator and execute scan
    const orchestrator = new ScanOrchestrator(
      this.projectManager as any,
      this.sonarAdmin as any
    );

    try {
      const result = await orchestrator.execute(scanParams, correlationId);

      // Format result as text summary
      const summary = ScanResultProcessor.formatAsTextSummary(result);

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
}

/**
 * Handle scan project MCP tool request
 *
 * @deprecated Use ScanHandler class with DI instead
 */
export async function handleScanProject(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(SonarScanProjectSchema, args, 'sonar_scan_project');

  // Extract scan parameters
  const scanParams: ScanParams = {
    projectPath: validatedArgs.projectPath,
    severityFilter: validatedArgs.severityFilter as any,
    typeFilter: validatedArgs.typeFilter as any,
    autoSetup: validatedArgs.autoSetup,
  };

  // Initialize dependencies (legacy approach)
  const projectManager = new ProjectManager();
  const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
  const sonarToken = process.env.SONAR_TOKEN;
  const sonarAdmin = new SonarAdmin(sonarUrl, sonarToken);

  // Create orchestrator and execute scan
  const orchestrator = new ScanOrchestrator(
    projectManager as any,
    sonarAdmin as any
  );

  try {
    const result = await orchestrator.execute(scanParams, correlationId);

    // Format result as text summary
    const summary = ScanResultProcessor.formatAsTextSummary(result);

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
