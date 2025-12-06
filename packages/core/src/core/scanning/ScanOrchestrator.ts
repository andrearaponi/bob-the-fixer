/**
 * ScanOrchestrator
 * Orchestrates the complete scan workflow: setup → scan → analysis → results
 */

import { SonarQubeClient, waitForCacheRefresh } from '../../sonar/index.js';
import { selectScanner, ScannerType } from '../../sonar/scanner-selection.js';
import { ProjectManager, ProjectConfig } from '../../universal/project-manager.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { getLogger, StructuredLogger } from '../../shared/logger/structured-logger.js';
import { sanitizePath } from '../../infrastructure/security/input-sanitization.js';
import { ScanParams, ScanResult, Issue, ProjectContext, FallbackAnalysisResult, PreScanValidationResult, SonarPropertiesConfig } from '../../shared/types/index.js';
import { ScanFallbackService, PropertiesFileManager } from './fallback/index.js';
import { PreScanValidator } from './validation/index.js';
import { processLibraryPaths } from './utils/path-utils.js';
import * as path from 'path';
import * as fs from 'fs/promises';

// Import utilities from server-utils
import {
  saveConfigToFile,
  generateProjectKey,
  getSeverityWeight,
  calculateQualityScore
} from '../../shared/utils/server-utils.js';
import { verifyProjectSetup } from '../../sonar/index.js';

export interface ScanOptions {
  maxRetries?: number;
  retryDelay?: number;
  enableFallback?: boolean;
}

/**
 * Custom error for recoverable scan failures
 * Contains fallback analysis for Claude to use
 */
export class ScanRecoverableError extends Error {
  public readonly fallbackAnalysis: FallbackAnalysisResult;

  constructor(message: string, fallbackAnalysis: FallbackAnalysisResult) {
    super(message);
    this.name = 'ScanRecoverableError';
    this.fallbackAnalysis = fallbackAnalysis;
  }
}

export class ScanOrchestrator {
  private readonly logger: StructuredLogger;
  private readonly options: Required<ScanOptions>;

  constructor(
    private readonly projectManager: ProjectManager,
    private readonly sonarAdmin: SonarAdmin,
    options: ScanOptions = {}
  ) {
    this.logger = getLogger();
    this.options = {
      maxRetries: options.maxRetries ?? 2,
      retryDelay: options.retryDelay ?? 5000,
      enableFallback: options.enableFallback ?? true
    };
  }

  /**
   * Execute complete scan workflow
   */
  async execute(params: ScanParams, correlationId?: string): Promise<ScanResult> {
    this.logger.info('Starting scan orchestration', { params }, correlationId);

    // 2. Determine auto-setup flag
    const autoSetup = await this.determineAutoSetup(params.autoSetup, correlationId);

    // 3. Ensure project configuration
    const config = await this.ensureProjectConfig(autoSetup);

    // 4. Get project context
    const projectContext = await this.projectManager.analyzeProject();

    // 4.5 Run universal pre-scan validation (best-effort, doesn't block)
    const preScanValidator = new PreScanValidator();
    const validationResult = await this.runPreScanValidation(
      preScanValidator,
      this.projectManager.getWorkingDirectory(),
      correlationId
    );

    // 5. Create SonarQube client
    const sonarClient = new SonarQubeClient(
      config.sonarUrl,
      config.sonarToken,
      config.sonarProjectKey,
      projectContext
    );

    // 6. Execute analysis with retry logic - capture the exact parameters used
    // Pass validation result to enable intelligent fallback with detected properties
    const projectPath = this.projectManager.getWorkingDirectory();
    const usedScannerParams = await this.executeAnalysisWithRetry(sonarClient, config, validationResult, correlationId);

    // 6.5 Auto-generate properties file with EXACT scanner parameters
    // Skip for Maven/Gradle - they don't need sonar-project.properties
    const propertiesFileExists = validationResult?.existingConfig?.exists ?? false;
    const scannerType = selectScanner(projectContext);
    const usesBuildToolPlugin = scannerType === ScannerType.MAVEN || scannerType === ScannerType.GRADLE;

    if (!propertiesFileExists && !usesBuildToolPlugin && usedScannerParams && usedScannerParams.length > 0) {
      await this.autoGeneratePropertiesFileFromParams(
        projectPath,
        usedScannerParams,
        correlationId
      );
    }

    // 7. Fetch and filter results
    const issues = await this.fetchIssuesWithFilters(
      sonarClient,
      params.severityFilter,
      params.typeFilter
    );

    // 7b. Fetch security hotspots
    const securityHotspots = await this.fetchSecurityHotspots(sonarClient);

    // 7c. Fetch project metrics for Clean Code metrics
    const projectMetrics = await this.fetchProjectMetrics(sonarClient);

    // 8. Build and return scan result
    return this.buildScanResult(config, issues, securityHotspots, projectContext, projectMetrics, validationResult);
  }

  /**
   * Run pre-scan validation (best-effort, doesn't block scan)
   */
  private async runPreScanValidation(
    validator: PreScanValidator,
    projectPath: string,
    correlationId?: string
  ): Promise<PreScanValidationResult | undefined> {
    try {
      const result = await validator.validate(projectPath);

      // Log detected languages
      if (result.languages.length > 0) {
        const langs = result.languages.map(l => l.buildTool || 'unknown').join(', ');
        this.logger.info(`Pre-scan detected languages: ${langs}`, { languages: result.languages.length }, correlationId);
      }

      // Log warnings (but continue with scan)
      for (const warning of result.warnings) {
        if (warning.severity === 'error') {
          this.logger.error(`Pre-scan: ${warning.message}`, undefined, { code: warning.code, suggestion: warning.suggestion }, correlationId);
        } else {
          this.logger.warn(`Pre-scan: ${warning.message}`, { code: warning.code, suggestion: warning.suggestion }, correlationId);
        }
      }

      // Log scan quality
      if (result.scanQuality !== 'full') {
        console.error(`⚠️  Pre-scan quality: ${result.scanQuality.toUpperCase()} (scan will proceed)`);
      }

      // Log config analysis if existing config found
      if (result.existingConfig?.exists) {
        console.error(`📋 Existing sonar-project.properties completeness: ${result.existingConfig.completenessScore}%`);
        if (result.existingConfig.missingCritical.length > 0) {
          console.error(`   Missing critical: ${result.existingConfig.missingCritical.join(', ')}`);
        }
      }

      return result;
    } catch (error) {
      this.logger.warn(`Pre-scan validation failed (continuing anyway): ${error instanceof Error ? error.message : 'Unknown error'}`, {}, correlationId);
      return undefined;
    }
  }

  /**
   * Resolve project path with smart defaults
   */
  private async resolveProjectPath(
    projectPath: string | undefined,
    correlationId?: string
  ): Promise<string> {
    if (!projectPath) {
      projectPath = process.cwd();
      this.logger.debug('No projectPath provided, using current working directory', { projectPath }, correlationId);
    }

    const safePath = sanitizePath(projectPath);
    this.projectManager.setWorkingDirectory(safePath);
    this.logger.debug('Working directory set', { workingDirectory: safePath }, correlationId);

    return safePath;
  }

  /**
   * Determine autoSetup flag with smart defaults
   */
  private async determineAutoSetup(
    autoSetup: boolean | undefined,
    correlationId?: string
  ): Promise<boolean> {
    if (autoSetup !== undefined) {
      return autoSetup;
    }

    const configPath = path.join(this.projectManager.getWorkingDirectory(), 'bobthefixer.env');
    try {
      await fs.access(configPath);
      this.logger.debug('bobthefixer.env found, setting autoSetup = false', { configPath }, correlationId);
      return false;
    } catch {
      this.logger.debug('bobthefixer.env not found, setting autoSetup = true', { configPath }, correlationId);
      return true;
    }
  }

  /**
   * Ensure project configuration exists, with auto-setup if needed
   */
  private async ensureProjectConfig(autoSetup: boolean): Promise<ProjectConfig> {
    try {
      const config = await this.projectManager.getOrCreateConfig();

      // If auto-setup is enabled and we have a temp token, set up properly
      if (autoSetup && config.sonarToken === 'temp-token-will-be-generated') {
        await this.performAutoSetup();
        return await this.projectManager.getOrCreateConfig();
      }

      return config;
    } catch (error) {
      this.logger.info(`Configuration not found, attempting auto-setup: ${error instanceof Error ? error.message : String(error)}`);
      if (autoSetup) {
        await this.performAutoSetup();
        return await this.projectManager.getOrCreateConfig();
      }
      throw new Error('No Bob the Fixer configuration found. Run sonar_auto_setup first or set autoSetup: true');
    }
  }

  /**
   * Perform auto-setup
   */
  private async performAutoSetup(): Promise<void> {
    const projectContext = await this.projectManager.analyzeProject();
    const projectKey = generateProjectKey(projectContext);

    // Create project in SonarQube
    await this.sonarAdmin.createProject(projectKey, projectContext.name);

    // Create analysis token
    const tokenName = `${projectKey}-analysis-token`;
    const tokenInfo = await this.sonarAdmin.generateToken(tokenName, projectKey, 'PROJECT_ANALYSIS_TOKEN');

    // Verify setup
    await verifyProjectSetup(projectKey, tokenInfo.token);

    // Save configuration
    const config: ProjectConfig = {
      sonarProjectKey: projectKey,
      sonarUrl: process.env.SONAR_URL ?? 'http://localhost:9000',
      sonarToken: tokenInfo.token,
      createdAt: new Date().toISOString()
    };

    const configPath = path.join(projectContext.path, 'bobthefixer.env');
    await saveConfigToFile(configPath, config);

    this.logger.info('Auto-setup completed successfully', { projectKey });
  }

  /**
   * Execute analysis with retry logic for permission issues
   * @returns The scanner parameters used (for writing to properties file)
   */
  private async executeAnalysisWithRetry(
    sonarClient: SonarQubeClient,
    config: ProjectConfig,
    validationResult?: PreScanValidationResult,
    correlationId?: string
  ): Promise<string[]> {
    // Extract detected properties from validation result for CLI fallback
    const detectedProperties = this.extractDetectedProperties(validationResult);

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        const usedParams = await this.runAnalysisCycle(sonarClient, attempt, detectedProperties);
        return usedParams; // Success - return params
      } catch (error: any) {
        if (this.shouldRetryAnalysis(error, attempt)) {
          this.logger.warn(`⏳ Retrying in ${this.options.retryDelay / 1000} seconds (timing/permission issue)...`, {}, correlationId);
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelay));
          continue;
        }

        // Try to generate properties file even on failure (if params were built)
        await this.tryGeneratePropertiesOnFailure(sonarClient, correlationId);

        // Check if this is a recoverable error and fallback is enabled
        if (this.options.enableFallback && this.isRecoverableConfigError(error)) {
          const fallbackResult = await this.performFallbackAnalysis(error, correlationId);
          throw new ScanRecoverableError(
            'Scan failed but can be recovered with proper configuration',
            fallbackResult
          );
        }

        throw new Error(this.buildAnalysisErrorMessage(error, attempt, config));
      }
    }
    return []; // Should never reach here
  }

  /**
   * Try to generate properties file even when scan fails.
   * This gives the user a starting point to correct and retry.
   * Skip for Maven/Gradle projects - they don't need sonar-project.properties
   */
  private async tryGeneratePropertiesOnFailure(
    sonarClient: SonarQubeClient,
    correlationId?: string
  ): Promise<void> {
    try {
      // Skip for Maven/Gradle - they don't need sonar-project.properties
      const scannerType = selectScanner(sonarClient.projectContext);
      if (scannerType === ScannerType.MAVEN || scannerType === ScannerType.GRADLE) {
        this.logger.debug('Skipping properties file generation for Maven/Gradle project', {}, correlationId);
        return;
      }

      const projectPath = this.projectManager.getWorkingDirectory();
      const propertiesPath = path.join(projectPath, 'sonar-project.properties');

      // Check if file already exists
      try {
        await fs.access(propertiesPath);
        // File exists, don't overwrite
        return;
      } catch {
        // File doesn't exist, proceed
      }

      // Get the parameters that were built before the failure
      const partialParams = sonarClient.getLastBuiltScannerParams();

      if (partialParams && partialParams.length > 0) {
        await this.autoGeneratePropertiesFileFromParams(projectPath, partialParams, correlationId);
        this.logger.info(
          '📝 Properties file generated despite scan failure - review and correct it',
          {},
          correlationId
        );
      }
    } catch (genError) {
      // Don't fail the main error flow if generation fails
      this.logger.debug(
        `Could not generate properties file on failure: ${genError instanceof Error ? genError.message : 'Unknown'}`,
        {},
        correlationId
      );
    }
  }

  /**
   * Check if error is a recoverable configuration error
   */
  private isRecoverableConfigError(error: any): boolean {
    const message = error.message ?? '';
    const recoverablePatterns = [
      /Unable to find source/i,
      /No sources found/i,
      /sonar\.sources.*does not exist/i,
      /Unable to find.*classes/i,
      /sonar\.java\.binaries/i,
      /Module.*not found/i,
      /Invalid module configuration/i,
      /No files nor directories matching/i,
      /Unable to determine language/i
    ];

    return recoverablePatterns.some(pattern => pattern.test(message));
  }

  /**
   * Perform fallback analysis for recoverable errors
   */
  private async performFallbackAnalysis(
    error: any,
    correlationId?: string
  ): Promise<FallbackAnalysisResult> {
    this.logger.info('Performing fallback analysis for recoverable error', { error: error.message }, correlationId);

    const fallbackService = new ScanFallbackService();
    const projectPath = this.projectManager.getWorkingDirectory();

    return await fallbackService.analyze(error.message, projectPath);
  }

  /**
   * Run a single analysis cycle
   * @param sonarClient The SonarQube client
   * @param attempt Current attempt number
   * @param detectedProperties Properties detected by JavaAnalyzer for CLI fallback
   * @returns The scanner parameters used (for writing to properties file)
   */
  private async runAnalysisCycle(
    sonarClient: SonarQubeClient,
    attempt: number,
    detectedProperties?: Map<string, string>
  ): Promise<string[]> {
    console.error(`🔍 Starting SonarQube analysis (attempt ${attempt}/${this.options.maxRetries})...`);

    let usedParams: string[] = [];
    if (sonarClient.projectContext?.buildTool === 'dotnet') {
      await sonarClient.triggerDotnetAnalysis(this.projectManager.getWorkingDirectory());
    } else {
      // Pass detected properties for Maven/Gradle fallback or CLI with smart params
      usedParams = await sonarClient.triggerAnalysis(
        this.projectManager.getWorkingDirectory(),
        detectedProperties
      );
    }

    console.error('✅ Analysis triggered successfully');

    console.error('⏳ Waiting for analysis to complete...');
    await sonarClient.waitForAnalysis();
    console.error('✅ Analysis completed successfully');

    console.error('⏳ Waiting for issue cache refresh...');
    await waitForCacheRefresh(sonarClient);
    console.error('✅ Cache refresh verified');

    return usedParams;
  }

  /**
   * Check if analysis should be retried
   */
  private shouldRetryAnalysis(error: any, attempt: number): boolean {
    const message = error.message ?? '';
    const isPermissionError = message.includes('403') ||
                             message.includes('Permission denied') ||
                             message.includes('Insufficient privileges');
    return isPermissionError && attempt < this.options.maxRetries;
  }

  /**
   * Build enhanced error message for analysis failures
   */
  private buildAnalysisErrorMessage(error: any, attempt: number, config: ProjectConfig): string {
    let message = `Analysis failed after ${attempt} attempts: ${error.message}`;

    if (error.message.includes('403') || error.message.includes('Permission denied')) {
      message += '\n\nTOKEN DIAGNOSTICS:\n';
      message += `- Project Key: ${config.sonarProjectKey}\n`;
      message += `- SonarQube URL: ${config.sonarUrl}\n`;
      message += `- Token: ${config.sonarToken.substring(0, 10)}...\n\n`;
      message += 'DEBUG STEPS:\n';
      message += '1. Wait 30 seconds and try again (project may need time to initialize)\n';
      message += '2. Check token permissions in SonarQube UI (Administration > Security > Users)\n';
      message += `3. Verify project exists: ${config.sonarUrl}/projects\n`;
      message += `4. Test API directly: curl -u TOKEN: ${config.sonarUrl}/api/projects/search\n`;
      message += '5. Try regenerating the token with admin permissions\n';
      message += '6. Check SonarQube server logs for detailed errors\n\n';
      message += 'COMMON FIX: Run sonar_auto_setup force: true to recreate with fresh token';
    }

    return message;
  }

  /**
   * Fetch issues with filters applied
   */
  private async fetchIssuesWithFilters(
    sonarClient: SonarQubeClient,
    severityFilter?: any,
    typeFilter?: any
  ): Promise<any[]> {
    const regularTypes = typeFilter?.filter((t: string) => t !== 'SECURITY_HOTSPOT');

    console.error('📊 Fetching analysis results from latest scan...');
    const issues = await sonarClient.getIssues({
      severities: severityFilter,
      types: (regularTypes && regularTypes.length > 0) ? regularTypes : undefined
    });

    console.error(`✅ Found ${issues.length} issues in latest analysis`);
    return issues;
  }

  /**
   * Fetch security hotspots
   */
  private async fetchSecurityHotspots(sonarClient: SonarQubeClient): Promise<any[]> {
    try {
      console.error('🔒 Fetching security hotspots...');
      const hotspots = await sonarClient.getSecurityHotspots({
        statuses: ['TO_REVIEW', 'REVIEWED']
      });
      console.error(`✅ Found ${hotspots.length} security hotspots`);
      return hotspots;
    } catch (error: any) {
      this.logger.warn('Could not fetch security hotspots', { error: error.message });
      return [];
    }
  }

  /**
   * Fetch project metrics for Clean Code metrics
   */
  private async fetchProjectMetrics(sonarClient: SonarQubeClient): Promise<any> {
    try {
      console.error('📊 Fetching project metrics...');
      const metrics = await sonarClient.getProjectMetrics();
      console.error(`✅ Retrieved project metrics`);
      return metrics;
    } catch (error: any) {
      this.logger.warn('Could not fetch project metrics', { error: error.message });
      return null;
    }
  }

  /**
   * Extract detected properties from validation result as a Map
   * Used to pass JavaAnalyzer-detected properties to CLI for intelligent scanning
   */
  private extractDetectedProperties(
    validationResult?: PreScanValidationResult
  ): Map<string, string> | undefined {
    if (!validationResult?.detectedProperties || validationResult.detectedProperties.length === 0) {
      return undefined;
    }

    const propsMap = new Map<string, string>();
    for (const prop of validationResult.detectedProperties) {
      propsMap.set(prop.key, prop.value);
    }

    if (propsMap.size > 0) {
      console.error(`📋 Extracted ${propsMap.size} properties from JavaAnalyzer for potential CLI fallback`);
    }

    return propsMap.size > 0 ? propsMap : undefined;
  }

  /**
   * Build scan result from issues
   */
  private buildScanResult(
    config: ProjectConfig,
    issues: any[],
    hotspots: any[],
    projectContext: ProjectContext,
    projectMetrics?: any,
    validationResult?: PreScanValidationResult
  ): ScanResult {
    const issuesBySeverity: Record<string, number> = {};
    const issuesByType: Record<string, number> = {};
    issues.forEach(issue => {
      issuesBySeverity[issue.severity] = (issuesBySeverity[issue.severity] || 0) + 1;
      issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
    });

    const qualityScore = calculateQualityScore(issues);

    // Extract Clean Code metrics from project metrics
    let cleanCodeMetrics = undefined;
    if (projectMetrics?.component?.measures) {
      const measures = projectMetrics.component.measures;
      const reliabilityMetric = measures.find((m: any) => m.metric === 'reliability_issues');
      const maintainabilityMetric = measures.find((m: any) => m.metric === 'maintainability_issues');
      const securityMetric = measures.find((m: any) => m.metric === 'security_issues');

      cleanCodeMetrics = {
        reliability: this.parseMetricTotal(reliabilityMetric?.value),
        maintainability: this.parseMetricTotal(maintainabilityMetric?.value),
        security: this.parseMetricTotal(securityMetric?.value)
      };
    }

    // Sort issues by severity weight and get top 10
    const sortedIssues = [...issues].sort((a, b) =>
      getSeverityWeight(b.severity) - getSeverityWeight(a.severity)
    );
    const topIssues: Issue[] = sortedIssues
      .slice(0, 10)
      .map(i => ({
        key: i.key,
        severity: i.severity,
        type: i.type,
        message: i.message,
        component: i.component,
        line: i.line
      }));

    // Process security hotspots
    let securityHotspotsData = undefined;
    if (hotspots.length > 0) {
      const byProbability: Record<string, number> = {};
      hotspots.forEach(hotspot => {
        const prob = hotspot.vulnerabilityProbability || 'MEDIUM';
        byProbability[prob] = (byProbability[prob] || 0) + 1;
      });

      // Sort hotspots by probability (HIGH > MEDIUM > LOW) and get top 5
      const probabilityWeight: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      const sortedHotspots = [...hotspots].sort((a, b) => {
        const weightA = probabilityWeight[a.vulnerabilityProbability] || 0;
        const weightB = probabilityWeight[b.vulnerabilityProbability] || 0;
        return weightB - weightA;
      });

      const topHotspots = sortedHotspots.slice(0, 5).map(h => ({
        key: h.key,
        vulnerabilityProbability: h.vulnerabilityProbability,
        securityCategory: h.securityCategory,
        message: h.message,
        component: h.component,
        line: h.line,
        status: h.status
      }));

      securityHotspotsData = {
        total: hotspots.length,
        byProbability,
        topHotspots
      };
    }

    // Determine config source
    let configSource: 'properties-file' | 'auto-detected' | 'cli-params' = 'cli-params';
    if (validationResult?.existingConfig?.exists) {
      configSource = 'properties-file';
    } else if (validationResult?.detectedProperties && validationResult.detectedProperties.length > 0) {
      configSource = 'auto-detected';
    }

    return {
      projectKey: config.sonarProjectKey,
      totalIssues: issues.length,
      issuesBySeverity,
      issuesByType,
      qualityScore,
      topIssues,
      projectContext,
      securityHotspots: securityHotspotsData,
      cleanCodeMetrics,
      preScanValidation: validationResult ? {
        scanQuality: validationResult.scanQuality,
        detectedLanguages: validationResult.languages.map(l => l.buildTool || 'unknown'),
        warnings: validationResult.warnings.length,
        configCompleteness: validationResult.existingConfig?.completenessScore,
        missingCritical: validationResult.existingConfig?.missingCritical || [],
        detectedProperties: validationResult.detectedProperties.map(p => ({
          key: p.key,
          value: p.value,
          confidence: p.confidence
        }))
      } : undefined,
      configSource
    };
  }

  /**
   * Auto-generate sonar-project.properties from EXACT scanner parameters
   * This ensures the properties file matches exactly what the scanner used
   */
  private async autoGeneratePropertiesFileFromParams(
    projectPath: string,
    scannerParams: string[],
    correlationId?: string
  ): Promise<void> {
    try {
      this.logger.info('Auto-generating sonar-project.properties from scanner parameters', {}, correlationId);
      console.error('📝 Auto-generating sonar-project.properties from scanner parameters...');

      // Parse -D parameters into a map
      const paramsMap = new Map<string, string>();
      for (const param of scannerParams) {
        if (param.startsWith('-D')) {
          const eqIdx = param.indexOf('=');
          if (eqIdx > 2) {
            const key = param.substring(2, eqIdx);
            const value = param.substring(eqIdx + 1);
            paramsMap.set(key, value);
          }
        }
      }

      // Skip if no useful parameters (e.g., only had auth params)
      const usefulParams = Array.from(paramsMap.keys()).filter(k =>
        !['sonar.host.url', 'sonar.login', 'sonar.token', 'sonar.projectVersion'].includes(k)
      );
      if (usefulParams.length === 0) {
        console.error('   No configuration parameters to save');
        return;
      }

      // Process library paths to relative
      const rawLibraries = paramsMap.get('sonar.java.libraries');
      const processedLibraries = rawLibraries
        ? processLibraryPaths(rawLibraries, projectPath, 'relative')
        : undefined;

      // Build config from scanner parameters
      const config: SonarPropertiesConfig = {
        projectKey: paramsMap.get('sonar.projectKey') || '',
        sources: paramsMap.get('sonar.sources'),
        tests: paramsMap.get('sonar.tests'),
        javaBinaries: paramsMap.get('sonar.java.binaries'),
        javaTestBinaries: paramsMap.get('sonar.java.test.binaries'),
        javaLibraries: processedLibraries,
        javaSource: paramsMap.get('sonar.java.source'),
        coverageReportPaths: paramsMap.get('sonar.coverage.jacoco.xmlReportPaths'),
        encoding: 'UTF-8'
      };

      // Write the file
      const propertiesManager = new PropertiesFileManager();
      const result = await propertiesManager.writeConfig(projectPath, config);

      if (result.success) {
        console.error(`✅ Generated ${result.configPath}`);
        console.error(`   Properties: ${usefulParams.length} from scanner`);

        // Log key properties
        const keyProps = ['sonar.sources', 'sonar.java.binaries', 'sonar.coverage.jacoco.xmlReportPaths'];
        for (const key of keyProps) {
          const value = paramsMap.get(key);
          if (value) {
            const displayValue = value.length > 50 ? value.substring(0, 47) + '...' : value;
            console.error(`   ${key}=${displayValue}`);
          }
        }

        if (rawLibraries) {
          const libCount = rawLibraries.split(',').filter(Boolean).length;
          console.error(`   sonar.java.libraries=${libCount} JARs (converted to relative paths)`);
        }
      }
    } catch (error) {
      // Non-blocking - log warning but don't fail the scan
      this.logger.warn(`Failed to auto-generate properties file: ${error instanceof Error ? error.message : 'Unknown error'}`, {}, correlationId);
      console.error(`⚠️ Could not auto-generate properties file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse Clean Code metric value (JSON string) to extract total
   */
  private parseMetricTotal(value: string | undefined): number {
    if (!value) return 0;

    try {
      const parsed = JSON.parse(value);
      return parsed.total || 0;
    } catch {
      return 0;
    }
  }
}
