/**
 * SecurityAnalyzer Service
 * Analyzes security hotspots and provides detailed security information
 */

import { ProjectManager } from '../../universal/project-manager.js';
import { SonarQubeClient } from '../../sonar/index.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import { getVulnerabilityEmoji, cleanHtmlContent, buildSourceContext } from '../../shared/utils/issue-details-utils.js';

export interface SecurityHotspotsOptions {
  statuses?: string[];
  resolutions?: string[];
  severities?: string[];
}

export interface SecurityHotspotDetailsOptions {
  hotspotKey: string;
  includeRuleDetails?: boolean;
  includeFilePath?: boolean;
  contextLines?: number;
}

export class SecurityAnalyzer {
  private readonly logger: StructuredLogger;

  constructor(private readonly projectManager: ProjectManager) {
    this.logger = getLogger();
  }

  /**
   * Get all security hotspots
   */
  async getSecurityHotspots(
    options: SecurityHotspotsOptions,
    correlationId?: string
  ): Promise<string> {
    this.logger.info('Getting security hotspots', { options }, correlationId);

    const config = await this.projectManager.getOrCreateConfig();
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey
    );

    const statuses = options.statuses || ['TO_REVIEW'];
    const hotspots = await sonarClient.getSecurityHotspots({
      statuses: statuses as any,
      resolutions: options.resolutions as any,
      severities: options.severities as any
    });

    return this.formatHotspotsList(hotspots, statuses);
  }

  /**
   * Get detailed information about a security hotspot
   */
  async getHotspotDetails(
    options: SecurityHotspotDetailsOptions,
    correlationId?: string
  ): Promise<string> {
    this.logger.info('Getting hotspot details', { hotspotKey: options.hotspotKey }, correlationId);

    const config = await this.projectManager.getOrCreateConfig();
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey
    );

    const hotspot = await sonarClient.getSecurityHotspotDetails(options.hotspotKey);

    // Get source code context
    const contextLines = options.contextLines ?? 10;
    const componentKey = typeof hotspot.component === 'object' ? hotspot.component.key : hotspot.component;
    let sourceContext = '';
    if (hotspot.line && componentKey) {
      try {
        sourceContext = await sonarClient.getSourceContext(
          componentKey,
          hotspot.line,
          contextLines
        );
      } catch (error: any) {
        this.logger.debug('Could not fetch source context', { component: componentKey });
      }
    }

    return this.formatHotspotDetails(
      hotspot,
      config,
      options.includeRuleDetails ?? true,
      options.includeFilePath ?? true,
      sourceContext,
      contextLines
    );
  }

  /**
   * Format hotspots list
   */
  private formatHotspotsList(hotspots: any[], statuses: string[]): string {
    if (hotspots.length === 0) {
      return `🔒 SECURITY HOTSPOTS\n\n` +
             `No security hotspots found with status: ${statuses.join(', ')}\n\n` +
             `✅ Great work on security!`;
    }

    let report = `🔒 SECURITY HOTSPOTS (${hotspots.length} found)\n\n`;

    // Group by vulnerability probability
    const byProbability: Record<string, any[]> = {
      HIGH: [],
      MEDIUM: [],
      LOW: []
    };

    hotspots.forEach(hotspot => {
      const probability = hotspot.vulnerabilityProbability || 'MEDIUM';
      if (!byProbability[probability]) {
        byProbability[probability] = [];
      }
      byProbability[probability].push(hotspot);
    });

    // Show high priority first
    for (const [probability, items] of Object.entries(byProbability)) {
      if (items.length === 0) continue;

      const emoji = getVulnerabilityEmoji(probability);
      report += `\n${emoji} ${probability} PROBABILITY (${items.length} hotspots):\n\n`;

      items.forEach((hotspot, idx) => {
        report += `${idx + 1}. ${hotspot.message}\n`;
        report += `   Key: ${hotspot.key}\n`;
        report += `   File: ${hotspot.component}${hotspot.line ? ` (line ${hotspot.line})` : ''}\n`;
        report += `   Status: ${hotspot.status}\n`;
        report += `   Category: ${hotspot.securityCategory}\n`;
        if (hotspot.resolution) {
          report += `   Resolution: ${hotspot.resolution}\n`;
        }
        report += `\n`;
      });
    }

    report += `\nℹ️ Use sonar_get_security_hotspot_details with the hotspot key for more information.`;

    return report;
  }

  /**
   * Format hotspot details
   */
  private formatHotspotDetails(
    hotspot: any,
    config: any,
    includeRuleDetails: boolean,
    includeFilePath: boolean,
    sourceContext?: string,
    contextLines?: number
  ): string {
    const emoji = getVulnerabilityEmoji(hotspot.vulnerabilityProbability);

    let report = `${emoji} SECURITY HOTSPOT DETAILS\n\n`;
    report += `MESSAGE: ${hotspot.message}\n\n`;

    report += `📍 LOCATION:\n`;
    // Handle component as either an object (from /api/hotspots/show) or string (from listing)
    const componentKey = typeof hotspot.component === 'object' ? hotspot.component.key : hotspot.component;
    const componentPath = typeof hotspot.component === 'object' && hotspot.component.path
      ? hotspot.component.path
      : componentKey;

    report += `File: ${componentPath}\n`;
    if (hotspot.line) {
      report += `Line: ${hotspot.line}\n`;
    }
    if (includeFilePath && componentKey) {
      const relativePath = componentKey.replace(`${config.sonarProjectKey}:`, '');
      const absolutePath = require('path').join(
        this.projectManager.getWorkingDirectory(),
        relativePath
      );
      report += `Absolute Path: ${absolutePath}\n`;
    }

    // Add source code context if available
    if (sourceContext && sourceContext.trim()) {
      // buildSourceContext expects component as a string for language detection
      const hotspotForContext = {
        ...hotspot,
        component: componentPath  // Use the path string instead of the object
      };
      report += `\n📄 ${buildSourceContext(hotspotForContext, sourceContext, contextLines)}`;
    }

    report += `\n📊 RISK ASSESSMENT:\n`;
    report += `Vulnerability Probability: ${hotspot.vulnerabilityProbability}\n`;
    report += `Security Category: ${hotspot.securityCategory}\n`;
    report += `Status: ${hotspot.status}\n`;

    if (hotspot.resolution) {
      report += `Resolution: ${hotspot.resolution}\n`;
    }

    if (hotspot.assignee) {
      report += `Assignee: ${hotspot.assignee}\n`;
    }

    if (includeRuleDetails && hotspot.rule) {
      report += `\n📋 RULE INFORMATION:\n`;
      report += `Rule: ${hotspot.rule.key}\n`;
      report += `Name: ${hotspot.rule.name}\n`;

      if (hotspot.rule.securityCategory) {
        report += `Category: ${hotspot.rule.securityCategory}\n`;
      }

      if (hotspot.rule.vulnerabilityProbability) {
        report += `Default Probability: ${hotspot.rule.vulnerabilityProbability}\n`;
      }

      if (hotspot.rule.riskDescription) {
        report += `\n🔍 RISK DESCRIPTION:\n`;
        report += cleanHtmlContent(hotspot.rule.riskDescription) + '\n';
      }

      if (hotspot.rule.vulnerabilityDescription) {
        report += `\n⚠️ VULNERABILITY:\n`;
        report += cleanHtmlContent(hotspot.rule.vulnerabilityDescription) + '\n';
      }

      if (hotspot.rule.fixRecommendations) {
        report += `\n💡 FIX RECOMMENDATIONS:\n`;
        report += cleanHtmlContent(hotspot.rule.fixRecommendations) + '\n';
      }
    }

    report += `\n🎯 NEXT STEPS:\n`;
    report += `1. Review the code at the specified location\n`;
    report += `2. Assess if this is a real security vulnerability\n`;
    report += `3. If vulnerable, apply the fix recommendations\n`;
    report += `4. Mark as reviewed in SonarQube (SAFE/FIXED/ACKNOWLEDGED)\n`;
    report += `5. Re-scan the project to verify the fix\n`;

    return report;
  }
}
