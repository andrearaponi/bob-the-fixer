/**
 * MCP handler for sonar_generate_config
 * Generates sonar-project.properties file based on provided configuration
 */

import { PropertiesFileManager } from '../../core/scanning/fallback/index.js';
import { validateInput, SonarGenerateConfigSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse, SonarPropertiesConfig, SonarModuleConfig } from '../../shared/types/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { sanitizePath } from '../../infrastructure/security/input-sanitization.js';
import * as path from 'path';

interface GenerateConfigArgs {
  projectPath?: string;
  config: {
    projectKey?: string;  // Now optional - will use from bobthefixer.env if not provided
    projectName?: string;
    projectVersion?: string;
    sources: string;
    tests?: string;
    exclusions?: string;
    encoding?: string;
    modules?: Array<{
      name: string;
      baseDir: string;
      sources: string;
      tests?: string;
      binaries?: string;
      exclusions?: string;
      language?: string;
    }>;
    javaBinaries?: string;
    javaLibraries?: string;
    coverageReportPaths?: string;
    additionalProperties?: Record<string, string>;
  };
}

/**
 * Handle generate config MCP tool request
 */
export async function handleGenerateConfig(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  // Validate input
  const validatedArgs = validateInput(
    SonarGenerateConfigSchema,
    args,
    'sonar_generate_config'
  ) as GenerateConfigArgs;

  // Resolve project path
  const projectPath = validatedArgs.projectPath
    ? sanitizePath(validatedArgs.projectPath)
    : process.cwd();

  // Get existing project configuration if available
  const projectManager = new ProjectManager();
  projectManager.setWorkingDirectory(projectPath);

  let existingProjectKey: string | undefined;
  let projectKeyWarning: string | undefined;

  try {
    const existingConfig = await projectManager.getOrCreateConfig();
    existingProjectKey = existingConfig.sonarProjectKey;
  } catch {
    // No existing config, that's fine
  }

  // Determine project key to use
  let projectKey: string;
  if (validatedArgs.config.projectKey) {
    projectKey = validatedArgs.config.projectKey;
    // Warn if different from existing
    if (existingProjectKey && existingProjectKey !== projectKey) {
      projectKeyWarning = `⚠️ Project key "${projectKey}" differs from configured key "${existingProjectKey}" in bobthefixer.env. ` +
        `Make sure this project exists in SonarQube or use the configured key.`;
    }
  } else if (existingProjectKey) {
    projectKey = existingProjectKey;
  } else {
    // Generate a default project key
    const projectContext = await projectManager.analyzeProject();
    projectKey = `${projectContext.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    projectKeyWarning = `⚠️ No project key provided and no bobthefixer.env found. Using generated key "${projectKey}". ` +
      `Run sonar_auto_setup first to create the project in SonarQube.`;
  }

  // Convert to internal config format
  const config: SonarPropertiesConfig = {
    projectKey,
    projectName: validatedArgs.config.projectName,
    projectVersion: validatedArgs.config.projectVersion,
    sources: validatedArgs.config.sources,
    tests: validatedArgs.config.tests,
    exclusions: validatedArgs.config.exclusions,
    encoding: validatedArgs.config.encoding,
    javaBinaries: validatedArgs.config.javaBinaries,
    javaLibraries: validatedArgs.config.javaLibraries,
    coverageReportPaths: validatedArgs.config.coverageReportPaths,
    additionalProperties: validatedArgs.config.additionalProperties
  };

  // Convert modules if present
  if (validatedArgs.config.modules && validatedArgs.config.modules.length > 0) {
    config.modules = validatedArgs.config.modules.map(m => ({
      name: m.name,
      baseDir: m.baseDir,
      sources: m.sources,
      tests: m.tests,
      binaries: m.binaries,
      exclusions: m.exclusions,
      language: m.language
    }));
  }

  // Create properties file
  const propertiesManager = new PropertiesFileManager();
  const result = await propertiesManager.writeConfig(projectPath, config);

  // Add project key warning if any
  if (projectKeyWarning) {
    result.warnings = result.warnings || [];
    result.warnings.unshift(projectKeyWarning);
  }

  // Format output
  const text = formatGenerateConfigResult(result, projectPath, existingProjectKey);

  return {
    content: [{ type: 'text', text }]
  };
}

/**
 * Format the result for display
 */
function formatGenerateConfigResult(
  result: {
    success: boolean;
    configPath: string;
    backupPath?: string;
    generatedContent: string;
    warnings?: string[];
  },
  projectPath: string,
  existingProjectKey?: string
): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push('✅ sonar-project.properties generated successfully');
    lines.push('');
    lines.push(`📁 Location: ${result.configPath}`);

    if (result.backupPath) {
      lines.push(`📦 Backup: ${result.backupPath}`);
    }

    if (existingProjectKey) {
      lines.push(`🔑 Using project key from bobthefixer.env: ${existingProjectKey}`);
    }

    lines.push('');
    lines.push('## Generated Configuration');
    lines.push('```properties');
    lines.push(result.generatedContent);
    lines.push('```');

    if (result.warnings && result.warnings.length > 0) {
      lines.push('');
      lines.push('## Warnings');
      for (const warning of result.warnings) {
        lines.push(warning);
      }
    }

    lines.push('');
    lines.push('## Next Steps');
    lines.push('Run `sonar_scan_project` with:');
    lines.push('```json');
    lines.push(JSON.stringify({
      projectPath: projectPath,
      autoSetup: false
    }, null, 2));
    lines.push('```');
  } else {
    lines.push('❌ Failed to generate sonar-project.properties');
  }

  return lines.join('\n');
}
