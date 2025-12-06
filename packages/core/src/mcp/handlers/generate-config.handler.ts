/**
 * MCP handler for sonar_generate_config
 * Generates sonar-project.properties file based on provided configuration
 * Supports auto-detection of project properties using PreScanValidator
 */

import { PropertiesFileManager } from '../../core/scanning/fallback/index.js';
import { validateInput, SonarGenerateConfigSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse, SonarPropertiesConfig, SonarModuleConfig, DetectedProperty } from '../../shared/types/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { sanitizePath } from '../../infrastructure/security/input-sanitization.js';
import { PreScanValidator } from '../../core/scanning/validation/PreScanValidator.js';
import { processLibraryPaths, countLibraries, summarizeLibraries, LibraryPathStrategy } from '../../core/scanning/utils/path-utils.js';
import * as path from 'path';

interface GenerateConfigArgs {
  projectPath?: string;
  autoDetect?: boolean;  // Default true - use PreScanValidator for auto-detection
  libraryPathStrategy?: LibraryPathStrategy;  // Default 'relative'
  config?: {  // Now optional when autoDetect is true
    projectKey?: string;  // Now optional - will use from bobthefixer.env if not provided
    projectName?: string;
    projectVersion?: string;
    sources?: string;  // Optional when auto-detected
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
    javaTestBinaries?: string;  // Added for test binaries
    javaLibraries?: string;
    javaSource?: string;  // Java version
    coverageReportPaths?: string;
    additionalProperties?: Record<string, string>;
  };
}

/**
 * Auto-detection result for display
 */
interface AutoDetectionInfo {
  languages: string[];
  propertiesDetected: number;
  detectedProperties: Array<{
    key: string;
    value: string;
    confidence: string;
    used: boolean;  // Whether this was used (vs overridden)
  }>;
  userOverrides: string[];
  libraryInfo?: {
    count: number;
    summary: string;
    strategy: LibraryPathStrategy;
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

  // Get settings
  const autoDetect = validatedArgs.autoDetect !== false;  // Default true
  const libraryPathStrategy = validatedArgs.libraryPathStrategy || 'relative';

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

  // Auto-detection using PreScanValidator
  let autoDetectionInfo: AutoDetectionInfo | undefined;
  const detectedPropertiesMap = new Map<string, DetectedProperty>();

  if (autoDetect) {
    const preScanValidator = new PreScanValidator();
    const validationResult = await preScanValidator.validate(projectPath);

    // Store detected properties for merging
    for (const prop of validationResult.detectedProperties) {
      detectedPropertiesMap.set(prop.key, prop);
    }

    // Build auto-detection info for output
    autoDetectionInfo = {
      languages: validationResult.languages.map(l =>
        l.buildTool ? `${l.language} (${l.buildTool})` : l.language
      ),
      propertiesDetected: validationResult.detectedProperties.length,
      detectedProperties: validationResult.detectedProperties.map(p => ({
        key: p.key,
        value: p.value.length > 60 ? p.value.substring(0, 57) + '...' : p.value,
        confidence: p.confidence,
        used: true  // Will be updated after merge
      })),
      userOverrides: [],
      libraryInfo: undefined
    };
  }

  // Helper to get value: user override > detected > undefined
  const getValue = (sonarKey: string, userValue?: string): string | undefined => {
    if (userValue !== undefined && userValue !== '') {
      // Track override
      if (autoDetectionInfo && detectedPropertiesMap.has(sonarKey)) {
        autoDetectionInfo.userOverrides.push(sonarKey);
        // Mark as not used
        const prop = autoDetectionInfo.detectedProperties.find(p => p.key === sonarKey);
        if (prop) prop.used = false;
      }
      return userValue;
    }
    return detectedPropertiesMap.get(sonarKey)?.value;
  };

  // Determine project key to use
  let projectKey: string;
  if (validatedArgs.config?.projectKey) {
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

  // Process library paths according to strategy
  const rawLibraries = getValue('sonar.java.libraries', validatedArgs.config?.javaLibraries);
  const processedLibraries = processLibraryPaths(rawLibraries, projectPath, libraryPathStrategy);

  // Track library info for output
  if (autoDetectionInfo && rawLibraries) {
    autoDetectionInfo.libraryInfo = {
      count: countLibraries(rawLibraries),
      summary: summarizeLibraries(rawLibraries, 3),
      strategy: libraryPathStrategy
    };
  }

  // Build config with merged values (user overrides detected)
  const config: SonarPropertiesConfig = {
    projectKey,
    projectName: validatedArgs.config?.projectName,
    projectVersion: validatedArgs.config?.projectVersion,
    sources: getValue('sonar.sources', validatedArgs.config?.sources) || 'src',
    tests: getValue('sonar.tests', validatedArgs.config?.tests),
    exclusions: validatedArgs.config?.exclusions,
    encoding: validatedArgs.config?.encoding || 'UTF-8',
    javaBinaries: getValue('sonar.java.binaries', validatedArgs.config?.javaBinaries),
    javaTestBinaries: getValue('sonar.java.test.binaries', validatedArgs.config?.javaTestBinaries),
    javaLibraries: processedLibraries,
    javaSource: getValue('sonar.java.source', validatedArgs.config?.javaSource),
    coverageReportPaths: getValue('sonar.coverage.jacoco.xmlReportPaths', validatedArgs.config?.coverageReportPaths),
    additionalProperties: validatedArgs.config?.additionalProperties
  };

  // Convert modules if present
  if (validatedArgs.config?.modules && validatedArgs.config.modules.length > 0) {
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

  // Format output with auto-detection info
  const text = formatGenerateConfigResult(result, projectPath, existingProjectKey, autoDetectionInfo);

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
  existingProjectKey?: string,
  autoDetectionInfo?: AutoDetectionInfo
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

    // Auto-detection summary
    if (autoDetectionInfo) {
      lines.push('');
      lines.push('## Auto-Detection Summary');

      if (autoDetectionInfo.languages.length > 0) {
        lines.push(`Languages: ${autoDetectionInfo.languages.join(', ')}`);
      }

      lines.push(`Properties detected: ${autoDetectionInfo.propertiesDetected}`);

      // Show key detected properties
      const usedProperties = autoDetectionInfo.detectedProperties.filter(p => p.used);
      if (usedProperties.length > 0) {
        for (const prop of usedProperties.slice(0, 8)) {  // Show up to 8
          const confidenceIcon = prop.confidence === 'high' ? '✓' :
                                  prop.confidence === 'medium' ? '~' : '?';
          lines.push(`  ${confidenceIcon} ${prop.key} = ${prop.value}`);
        }
        if (usedProperties.length > 8) {
          lines.push(`  ... (+${usedProperties.length - 8} more)`);
        }
      }

      // Library info
      if (autoDetectionInfo.libraryInfo) {
        lines.push('');
        lines.push(`Libraries: ${autoDetectionInfo.libraryInfo.count} JARs (${autoDetectionInfo.libraryInfo.summary})`);
        lines.push(`Path strategy: ${autoDetectionInfo.libraryInfo.strategy}`);
      }

      // User overrides
      if (autoDetectionInfo.userOverrides.length > 0) {
        lines.push('');
        lines.push(`User overrides applied: ${autoDetectionInfo.userOverrides.length}`);
        for (const override of autoDetectionInfo.userOverrides) {
          lines.push(`  - ${override}`);
        }
      }
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
