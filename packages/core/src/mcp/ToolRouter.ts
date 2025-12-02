/**
 * ToolRouter
 * Maps tool names to their handler functions
 * This eliminates the need for a large switch statement
 */

import { MCPResponse } from '../shared/types/index.js';
import { getVersionChecker } from '../shared/version/index.js';
import { handleScanProject } from './handlers/scan.handler.js';
import { handleAutoSetup } from './handlers/project-setup.handler.js';
import { handleProjectDiscovery } from './handlers/project-discovery.handler.js';
import { handleConfigManager } from './handlers/config-manager.handler.js';
import { handleGetIssueDetails } from './handlers/issue-details.handler.js';
import { handleAnalyzePatterns } from './handlers/pattern-analysis.handler.js';
import { handleGetSecurityHotspots } from './handlers/security-hotspots.handler.js';
import { handleGetSecurityHotspotDetails } from './handlers/security-hotspot-details.handler.js';
import { handleGetQualityGate } from './handlers/quality-gate.handler.js';
import { handleGetProjectMetrics } from './handlers/project-metrics.handler.js';
import { handleGetTechnicalDebt } from './handlers/technical-debt.handler.js';
import { handleGetDuplicationSummary } from './handlers/duplication-summary.handler.js';
import { handleGenerateReport } from './handlers/generate-report.handler.js';
import { handleCleanup } from './handlers/cleanup.handler.js';
import { handleDiagnosePermissions } from './handlers/diagnose-permissions.handler.js';
import { handleDeleteProject } from './handlers/delete-project.handler.js';
import { handleLinkExistingProject } from './handlers/link-existing-project.handler.js';
import { handleGetCoverageGaps } from './handlers/coverage-gaps.handler.js';
import { handleGenerateConfig } from './handlers/generate-config.handler.js';

/**
 * Handler function signature
 */
export type ToolHandler = (args: any, correlationId?: string) => Promise<MCPResponse>;

/**
 * Map of tool names to handler functions
 */
export const toolRoutes: Record<string, ToolHandler> = {
  sonar_auto_setup: handleAutoSetup,
  sonar_project_discovery: handleProjectDiscovery,
  sonar_config_manager: handleConfigManager,
  sonar_scan_project: handleScanProject,
  sonar_get_issue_details: handleGetIssueDetails,
  sonar_generate_report: handleGenerateReport,
  sonar_get_quality_gate: handleGetQualityGate,
  sonar_get_duplication_summary: handleGetDuplicationSummary,
  sonar_get_technical_debt: handleGetTechnicalDebt,
  sonar_cleanup: handleCleanup,
  sonar_diagnose_permissions: handleDiagnosePermissions,
  sonar_get_security_hotspots: handleGetSecurityHotspots,
  sonar_get_security_hotspot_details: handleGetSecurityHotspotDetails,
  sonar_get_project_metrics: handleGetProjectMetrics,
  sonar_analyze_patterns: handleAnalyzePatterns,
  sonar_delete_project: handleDeleteProject,
  sonar_link_existing_project: handleLinkExistingProject,
  sonar_get_coverage_gaps: handleGetCoverageGaps,
  sonar_generate_config: handleGenerateConfig
};

/**
 * Route a tool call to the appropriate handler
 */
export async function routeTool(toolName: string, args: any, correlationId?: string): Promise<MCPResponse> {
  const handler = toolRoutes[toolName];

  if (!handler) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const result = await handler(args, correlationId);

  // Prepend version update banner if available (only shown once per session)
  // Wrapped in try-catch to never block tool execution (offline support)
  try {
    const versionChecker = getVersionChecker();
    const banner = versionChecker?.getUpdateBannerOnce();

    if (banner && result.content && result.content.length > 0 && !result.isError) {
      const firstContent = result.content[0];
      if (firstContent.type === 'text' && typeof firstContent.text === 'string') {
        firstContent.text = banner + firstContent.text;
      }
    }
  } catch {
    // Silently ignore - never block tool execution
  }

  return result;
}

/**
 * Check if a tool exists
 */
export function toolExists(toolName: string): boolean {
  return toolName in toolRoutes;
}

/**
 * Get all available tool names
 */
export function getAvailableTools(): string[] {
  return Object.keys(toolRoutes);
}
