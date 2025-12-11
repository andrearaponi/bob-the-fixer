/**
 * Scanner Selection Module
 *
 * Determines the best scanner to use based on project context:
 * - Maven/Gradle + Java/Kotlin → Use native plugin (better analysis)
 * - Other languages → Use sonar-scanner CLI
 */

import { ProjectContext } from '../universal/project-manager.js';

/**
 * Available scanner types
 */
export enum ScannerType {
  /** Maven Sonar Plugin (mvn sonar:sonar) */
  MAVEN = 'maven',
  /** Gradle Sonar Plugin (gradle sonar) */
  GRADLE = 'gradle',
  /** SonarScanner CLI (sonar-scanner) */
  CLI = 'cli'
}

/**
 * Configuration for building scanner commands
 */
export interface ScannerCommandConfig {
  hostUrl: string;
  token: string;
  projectKey: string;
  extraProperties?: Record<string, string>;
}

/**
 * Result of building a scanner command
 */
export interface ScannerCommand {
  command: string;
  args: string[];
}

/**
 * Languages that benefit from Maven/Gradle plugin analysis
 */
const JVM_LANGUAGES = ['java', 'kotlin', 'scala', 'groovy'];

/**
 * Build tools that have native SonarQube plugins
 */
const NATIVE_PLUGIN_BUILD_TOOLS = ['maven', 'gradle'];

/**
 * Options for scanner selection
 */
export interface ScannerOptions {
  /** Force CLI scanner even for Maven/Gradle projects */
  forceCliScanner?: boolean;
}

/**
 * Select the best scanner type based on project context
 *
 * For Java/Kotlin with Maven/Gradle → Use native plugin (better classpath resolution)
 * For everything else → Use sonar-scanner CLI
 *
 * @param context Project context with language and build tool info
 * @param options Scanner options (e.g., forceCliScanner)
 */
export function selectScanner(
  context: ProjectContext | undefined,
  options?: ScannerOptions
): ScannerType {
  // If forceCliScanner is true, always use CLI
  if (options?.forceCliScanner) {
    return ScannerType.CLI;
  }

  if (!context) {
    return ScannerType.CLI;
  }

  const hasJvmLanguage = context.language.some(lang =>
    JVM_LANGUAGES.includes(lang.toLowerCase())
  );

  const hasNativePluginBuildTool = context.buildTool &&
    NATIVE_PLUGIN_BUILD_TOOLS.includes(context.buildTool.toLowerCase());

  if (hasJvmLanguage && hasNativePluginBuildTool) {
    return context.buildTool?.toLowerCase() === 'maven'
      ? ScannerType.MAVEN
      : ScannerType.GRADLE;
  }

  return ScannerType.CLI;
}

/**
 * Build Maven sonar:sonar command
 */
export function buildMavenCommand(config: ScannerCommandConfig): ScannerCommand {
  const args = [
    'sonar:sonar',
    '-q', // Quiet mode - less verbose output
    `-Dsonar.host.url=${config.hostUrl}`,
    `-Dsonar.login=${config.token}`,
    `-Dsonar.projectKey=${config.projectKey}`,
    `-Dsonar.projectVersion=${Date.now()}` // Force new analysis
  ];

  // Add extra properties if provided
  if (config.extraProperties) {
    for (const [key, value] of Object.entries(config.extraProperties)) {
      args.push(`-D${key}=${value}`);
    }
  }

  return {
    command: 'mvn',
    args
  };
}

/**
 * Build Gradle sonar command
 */
export function buildGradleCommand(config: ScannerCommandConfig): ScannerCommand {
  const args = [
    'sonar',
    '-q', // Quiet mode
    `-Dsonar.host.url=${config.hostUrl}`,
    `-Dsonar.login=${config.token}`,
    `-Dsonar.projectKey=${config.projectKey}`,
    `-Dsonar.projectVersion=${Date.now()}`
  ];

  // Add extra properties if provided
  if (config.extraProperties) {
    for (const [key, value] of Object.entries(config.extraProperties)) {
      args.push(`-D${key}=${value}`);
    }
  }

  return {
    command: './gradlew',
    args
  };
}

/**
 * Get human-readable description of scanner type
 */
export function getScannerDescription(type: ScannerType): string {
  switch (type) {
    case ScannerType.MAVEN:
      return 'Maven Sonar Plugin (mvn sonar:sonar) - Full classpath analysis';
    case ScannerType.GRADLE:
      return 'Gradle Sonar Plugin (gradle sonar) - Full classpath analysis';
    case ScannerType.CLI:
      return 'SonarScanner CLI (sonar-scanner)';
  }
}
