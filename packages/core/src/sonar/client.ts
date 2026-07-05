import axios, { AxiosInstance } from 'axios';
import { SonarIssue, IssueFilter, SonarRuleDetails, SonarSecurityHotspot, SonarProjectMetrics, SonarSecurityHotspotDetails, SonarFilesWithDuplication, SonarDuplicationDetails, HotspotStatus, HotspotResolution, HotspotSeverity, SonarRuleSearchFilter, SonarRulesResponse, SonarComponentDetails, SonarQualityGateStatus, SonarLineCoverage, FileWithCoverage, FilesWithCoverageGaps, CoveragePriority } from './types';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectContext } from '../universal/project-manager';
import { sanitizeCommandArgs, shellQuote, sanitizeProjectKey, sanitizeUrl, maskToken } from '../infrastructure/security/input-sanitization.js';
import { PreScanValidator } from '../core/scanning/validation/index.js';
import { selectScanner, ScannerType, buildMavenCommand, buildGradleCommand, getScannerDescription, ScannerOptions } from './scanner-selection.js';
import { SonarSourceFetcher } from './api/SonarSourceFetcher.js';
import { ScannerParameterBuilder } from './scanner/ScannerParameterBuilder.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export class SonarQubeClient {
  public readonly client: AxiosInstance;  // Make public for diagnostic access
  private readonly projectKey: string;
  public readonly projectContext?: ProjectContext;
  private readonly paramBuilder: ScannerParameterBuilder;
  private readonly sourceFetcher: SonarSourceFetcher;

  /**
   * Rule details cache with TTL
   * Reduces API calls for repeated rule lookups (e.g., during pattern analysis)
   */
  private ruleCache: Map<string, { data: SonarRuleDetails; expires: number }> = new Map();
  private readonly RULE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes


  /**
   * Scanner options (e.g., forceCliScanner)
   */
  private scannerOptions: ScannerOptions = {};

  /**
   * Stores the last scanner parameters built during triggerAnalysis.
   * Used to generate properties file even if scan fails.
   */
  private lastBuiltScannerParams: string[] = [];

  constructor(
    baseUrl: string,
    token: string,
    projectKey: string,
    projectContext?: ProjectContext
  ) {
    // Validate and sanitize inputs
    this.projectKey = sanitizeProjectKey(projectKey);
    this.projectContext = projectContext;
    this.paramBuilder = new ScannerParameterBuilder(projectContext);
    
    const sanitizedUrl = sanitizeUrl(baseUrl);
    
    this.client = axios.create({
      baseURL: sanitizedUrl,
      headers: {
        'Authorization': `Bearer ${token}`, // Token validation happens in token manager
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    this.sourceFetcher = new SonarSourceFetcher(this.client);

    // Add response interceptor to handle 401 errors
    this.client.interceptors.response.use(
      response => response,
      (error: Error) => {
        if ((error as any).response?.status === 401) {
          const tokenInfo = token ? `Token present (${maskToken(token)})` : 'NO TOKEN';
          const envInfo = process.env.SONAR_TOKEN ? 'Env token present' : 'NO ENV TOKEN';

          console.error('[SonarQubeClient] 401 Unauthorized - Authentication failed');
          console.error('[SonarQubeClient] Token status:', tokenInfo);
          console.error('[SonarQubeClient] Environment:', envInfo);
          console.error('[SonarQubeClient] This usually happens when:');
          console.error('  1. MCP server was restarted and lost environment variables');
          console.error('  2. Token expired or was revoked in SonarQube');
          console.error('  3. Using wrong token from local file instead of environment');
          console.error('[SonarQubeClient] Solution: Restart MCP server with: claude mcp remove bob-the-fixer && ./setup-token.sh');

          error.message = `SonarQube authentication failed (401). ${tokenInfo}. ${envInfo}. Restart MCP server to fix.`;
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set scanner options (e.g., forceCliScanner)
   * Call this before triggerAnalysis() to override default scanner selection
   */
  setScannerOptions(options: ScannerOptions): void {
    this.scannerOptions = options;
  }

  /**
   * Trigger SonarQube analysis
   * Automatically selects the best scanner based on project context:
   * - Maven/Gradle + Java/Kotlin → Native plugin (better analysis)
   * - Other languages → sonar-scanner CLI
   *
   * @returns The scanner parameters used (for writing to properties file)
   */
  async triggerAnalysis(
    projectPath: string,
    detectedProperties?: Map<string, string>
  ): Promise<string[]> {
    const lockFile = path.join(projectPath, '.sonar-analysis.lock');

    try {
      // Use file-based locking to prevent concurrent sonar-scanner processes
      await this.acquireLock(lockFile);

      // Sanitize project path
      const safePath = path.resolve(projectPath);

      // Select the best scanner based on project context and options
      const scannerType = selectScanner(this.projectContext, this.scannerOptions);
      console.error(`📊 Scanner selected: ${getScannerDescription(scannerType)}`);
      if (this.scannerOptions.forceCliScanner) {
        console.error(`⚡ CLI scanner forced via FORCE_CLI_SCANNER=true`);
      }

      // Route to appropriate scanner method
      switch (scannerType) {
        case ScannerType.MAVEN:
          return await this.triggerMavenAnalysis(safePath, detectedProperties);

        case ScannerType.GRADLE:
          return await this.triggerGradleAnalysis(safePath, detectedProperties);

        case ScannerType.CLI:
        default:
          return await this.triggerCliAnalysis(safePath, detectedProperties);
      }

    } catch (error: any) {
      // Enhanced error handling with specific suggestions
      let errorMessage = `Analysis failed: ${error.message}`;
      const scannerType = selectScanner(this.projectContext, this.scannerOptions);

      // Maven-specific error handling
      if (scannerType === ScannerType.MAVEN) {
        if (error.message.includes('COMPILATION_ERROR') ||
            error.message.includes('Cannot find symbol') ||
            error.message.includes('package does not exist')) {
          errorMessage += '\n\n🔧 Solution: Maven project needs to be compiled first!\n' +
                        '  Run: mvn clean compile\n\n' +
                        '  After compilation, retry the scan.';
        } else if (error.message.includes('mvn: not found') ||
                   error.message.includes('mvn: command not found')) {
          errorMessage += '\n\n🔧 Solution: Maven is not installed.\n' +
                        '  Install Maven:\n' +
                        '    - macOS: brew install maven\n' +
                        '    - Linux: apt-get install maven\n' +
                        '    - Windows: choco install maven';
        }
      }
      // Gradle-specific error handling
      else if (scannerType === ScannerType.GRADLE) {
        if (error.message.includes('compileJava FAILED') ||
            error.message.includes('Compilation failed') ||
            error.message.includes('Could not resolve')) {
          errorMessage += '\n\n🔧 Solution: Gradle project needs to be compiled first!\n' +
                        '  Run: ./gradlew clean compileJava\n\n' +
                        '  After compilation, retry the scan.';
        } else if (error.message.includes('gradlew: not found') ||
                   error.message.includes('gradlew: command not found') ||
                   error.message.includes('permission denied') && error.message.includes('gradlew')) {
          errorMessage += '\n\n🔧 Solution: Gradle wrapper not found or not executable.\n' +
                        '  Try:\n' +
                        '    - chmod +x gradlew (make executable)\n' +
                        '    - gradle wrapper (regenerate wrapper)\n' +
                        '    - Or install Gradle: brew install gradle';
        } else if (error.message.includes('sonar') && error.message.includes('not found') ||
                   error.message.includes('Task') && error.message.includes('sonar')) {
          errorMessage += '\n\n🔧 Solution: Gradle Sonar plugin not configured.\n' +
                        '  Unlike Maven, Gradle requires explicit plugin configuration.\n\n' +
                        '  ⚠️ IMPORTANT: Use WebFetch to get the latest plugin version from:\n' +
                        '  https://plugins.gradle.org/plugin/org.sonarqube\n\n' +
                        '  Then add to build.gradle:\n' +
                        '  plugins {\n' +
                        '    id "org.sonarqube" version "X.X.X"\n' +
                        '  }\n\n' +
                        '  Or for build.gradle.kts:\n' +
                        '  plugins {\n' +
                        '    id("org.sonarqube") version "X.X.X"\n' +
                        '  }';
        }
      }
      // CLI-specific error handling
      else if (error.message.includes('sonar-scanner: not found') || error.message.includes('command not found')) {
        errorMessage += '\n\n🔧 Solution: Install SonarQube Scanner CLI:\n' +
                      '  - Download from: https://docs.sonarqube.org/latest/analysis/scan/sonarscanner/\n' +
                      '  - Or install via package manager:\n' +
                      '    - macOS: brew install sonar-scanner\n' +
                      '    - Linux: apt-get install sonar-scanner-cli\n' +
                      '    - Windows: choco install sonarscanner-msbuild-net46';
      }

      // Generic error handling (applies to all scanners)
      if (error.message.includes('timeout')) {
        errorMessage += '\n\n🔧 Solution: The analysis took longer than expected.\n' +
                      '  - For large projects, increase timeout or exclude test files\n' +
                      '  - Check if compilation completed successfully\n' +
                      '  - Consider using sonar.exclusions to skip large directories';
      } else if (error.message.includes('Permission denied') || error.code === 'EACCES') {
        errorMessage += '\n\n🔧 Solution: Permission issues detected.\n' +
                      '  - Ensure write access to project directory\n' +
                      '  - Check if .sonar directory can be created\n' +
                      '  - Run with appropriate user permissions';
      } else if (error.message.includes('401') || error.message.includes('403')) {
        errorMessage += '\n\n🔧 Solution: Authentication/Authorization error.\n' +
                      '  - Verify SonarQube token is valid and has project creation permissions\n' +
                      '  - Check if project key already exists with different permissions\n' +
                      '  - Ensure SonarQube server is accessible';
      }

      throw new Error(errorMessage);
    } finally {
      // Always release the lock
      await this.releaseLock(lockFile);
    }
  }

  /**
   * Trigger analysis using Maven Sonar Plugin (mvn sonar:sonar)
   * Better for Java/Kotlin projects - full classpath resolution
   * Falls back to CLI with detected properties if Maven fails
   */
  private async triggerMavenAnalysis(
    projectPath: string,
    detectedProperties?: Map<string, string>
  ): Promise<string[]> {
    console.error('🔧 Using Maven Sonar Plugin for analysis (better classpath resolution)');

    try {
      // Check if project is compiled before running analysis
      await this.paramBuilder.checkJavaCompilation(projectPath);

      const { command, args } = buildMavenCommand({
        hostUrl: this.client.defaults.baseURL as string,
        token: this.getToken(),
        projectKey: this.projectKey
      });

      // Store params for properties file generation (if needed on failure)
      const paramsForFile = args.filter(arg => arg.startsWith('-Dsonar.'));
      this.lastBuiltScannerParams = paramsForFile;

      const fullCommand = `${command} ${args.map(arg => shellQuote(arg)).join(' ')}`;
      console.error(`Running: mvn sonar:sonar`);
      console.error(`Masked token used: ${maskToken(this.getToken())}`);

      const { stdout, stderr } = await execAsync(fullCommand, {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 600000, // 10 minutes for Maven (can be slower)
        env: { ...process.env, PATH: process.env.PATH }
      });

      console.error('✅ Maven Sonar analysis completed successfully');
      if (stdout) console.error('Analysis output:', stdout.slice(-500)); // Last 500 chars
      if (stderr) console.error('Analysis warnings:', stderr.slice(-500));

      return paramsForFile;
    } catch (mavenError: any) {
      // If we have detected properties from JavaAnalyzer, fallback to CLI
      if (detectedProperties && detectedProperties.size > 0) {
        console.error('⚠️ Maven plugin failed, falling back to CLI with detected properties from JavaAnalyzer');
        console.error(`   Maven error: ${mavenError.message?.slice(0, 200)}`);
        return await this.triggerCliWithDetectedParams(projectPath, detectedProperties);
      }

      // No fallback available - re-throw the original error
      throw mavenError;
    }
  }

  /**
   * Trigger analysis using Gradle Sonar Plugin (gradle sonar)
   * Better for Java/Kotlin projects - full classpath resolution
   * Falls back to CLI with detected properties if Gradle fails
   */
  private async triggerGradleAnalysis(
    projectPath: string,
    detectedProperties?: Map<string, string>
  ): Promise<string[]> {
    console.error('🔧 Using Gradle Sonar Plugin for analysis (better classpath resolution)');

    try {
      // Check if project is compiled before running analysis
      await this.paramBuilder.checkJavaCompilation(projectPath);

      const { command, args } = buildGradleCommand({
        hostUrl: this.client.defaults.baseURL as string,
        token: this.getToken(),
        projectKey: this.projectKey
      });

      // Store params for properties file generation (if needed on failure)
      const paramsForFile = args.filter(arg => arg.startsWith('-Dsonar.'));
      this.lastBuiltScannerParams = paramsForFile;

      const fullCommand = `${command} ${args.map(arg => shellQuote(arg)).join(' ')}`;
      console.error(`Running: ./gradlew sonar`);
      console.error(`Masked token used: ${maskToken(this.getToken())}`);

      const { stdout, stderr } = await execAsync(fullCommand, {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 600000, // 10 minutes for Gradle
        env: { ...process.env, PATH: process.env.PATH }
      });

      console.error('✅ Gradle Sonar analysis completed successfully');
      if (stdout) console.error('Analysis output:', stdout.slice(-500));
      if (stderr) console.error('Analysis warnings:', stderr.slice(-500));

      return paramsForFile;
    } catch (gradleError: any) {
      // If we have detected properties from JavaAnalyzer, fallback to CLI
      if (detectedProperties && detectedProperties.size > 0) {
        console.error('⚠️ Gradle plugin failed, falling back to CLI with detected properties from JavaAnalyzer');
        console.error(`   Gradle error: ${gradleError.message?.slice(0, 200)}`);
        return await this.triggerCliWithDetectedParams(projectPath, detectedProperties);
      }

      // No fallback available - re-throw the original error
      throw gradleError;
    }
  }

  /**
   * Trigger analysis using SonarScanner CLI (sonar-scanner)
   * Used for non-JVM languages or projects without Maven/Gradle
   *
   * Priority order:
   * 1. If sonar-project.properties exists → use minimal params + missing critical only
   * 2. If detected properties exist → use all detected properties
   * 3. Otherwise → use language-specific defaults
   */
  private async triggerCliAnalysis(
    projectPath: string,
    detectedProperties?: Map<string, string>
  ): Promise<string[]> {
    // Check if sonar-project.properties exists - if so, respect it!
    const propsFile = path.join(projectPath, 'sonar-project.properties');
    const hasPropertiesFile = await this.fileExists(propsFile);

    let params: string[];

    if (hasPropertiesFile) {
      // CASE 1: Properties file exists - use minimal params + missing critical only
      // sonar-scanner will read the file automatically
      console.error('📄 Using sonar-project.properties for configuration');
      params = this.buildAuthParams();

      try {
        const missingCritical = await this.getMissingCriticalProperties(projectPath, detectedProperties);
        if (missingCritical.length > 0) {
          console.error(`  ➕ Adding ${missingCritical.length} missing critical properties`);
          params.push(...missingCritical);
        } else {
          console.error('  ✅ All critical properties present in config file');
        }
      } catch (error) {
        console.error(`  ⚠️ Pre-scan validation skipped: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else if (detectedProperties && detectedProperties.size > 0) {
      // CASE 2: No properties file, but we have detected properties from analyzers
      console.error('🔧 Using detected properties (no sonar-project.properties found)');
      params = this.buildBaseParams();

      console.error('📋 Detected properties:');
      for (const [key, value] of detectedProperties) {
        params.push(`-D${key}=${value}`);
        const displayValue = key.includes('token') || key.includes('login')
          ? '****'
          : (value.length > 100 ? value.slice(0, 100) + '...' : value);
        console.error(`   ${key}=${displayValue}`);
      }
    } else {
      // CASE 3: No properties file, no detected properties - use language-specific defaults
      console.error('🔧 Using language-specific defaults');
      params = await this.buildLanguageSpecificParams(projectPath);
    }

    // Execute scanner with built params
    return await this.runCliScanner(projectPath, params);
  }

  /**
   * Trigger CLI analysis with pre-detected properties from JavaAnalyzer/PreScanValidator
   * Used when Maven/Gradle fails as fallback
   */
  private async triggerCliWithDetectedParams(
    projectPath: string,
    detectedProperties: Map<string, string>
  ): Promise<string[]> {
    console.error('🔧 Using SonarScanner CLI with detected properties (Maven/Gradle fallback)');

    // Build params using helpers
    const params = this.buildBaseParams();

    // Add all detected properties
    console.error('📋 Detected properties:');
    for (const [key, value] of detectedProperties) {
      params.push(`-D${key}=${value}`);
      const displayValue = key.includes('token') || key.includes('login')
        ? '****'
        : (value.length > 100 ? value.slice(0, 100) + '...' : value);
      console.error(`   ${key}=${displayValue}`);
    }

    // Execute scanner using shared helper
    return await this.runCliScanner(projectPath, params);
  }

  async triggerDotnetAnalysis(projectPath: string): Promise<void> {
    const lockFile = path.join(projectPath, '.sonar-analysis.lock');

    try {
      await this.acquireLock(lockFile);

      const safePath = path.resolve(projectPath);
      const files = await fs.readdir(safePath);
      const solutionFile = files.find(f => f.endsWith('.sln'));
      const token = this.getToken();

      // Run via execFile with an argument array so no shell is involved. The
      // .sln filename is attacker-controlled (it comes from the scanned repo),
      // so it must never be interpolated into a shell command line. execFile
      // passes each argument verbatim to `dotnet`, which closes the injection.
      const beginArgs = [
        'sonarscanner',
        'begin',
        `/k:${this.projectKey}`,
        `/d:sonar.host.url=${this.client.defaults.baseURL}`,
        `/d:sonar.login=${token}`,
        `/d:sonar.verbose=true`,
      ];
      if (solutionFile) {
        beginArgs.push(`/d:sonar.solution=${solutionFile}`);
      }

      console.error(`Running .NET analysis step 1 (begin) [token ${maskToken(token)}]`);
      await execFileAsync('dotnet', beginArgs, { cwd: safePath, maxBuffer: 10 * 1024 * 1024 });

      const buildArgs = solutionFile ? ['build', solutionFile] : ['build'];
      console.error('Running .NET analysis step 2 (build)');
      await execFileAsync('dotnet', buildArgs, { cwd: safePath, maxBuffer: 10 * 1024 * 1024 });

      const endArgs = [
        'sonarscanner',
        'end',
        `/d:sonar.login=${token}`,
      ];
      console.error('Running .NET analysis step 3 (end)');
      await execFileAsync('dotnet', endArgs, { cwd: safePath, maxBuffer: 10 * 1024 * 1024 });

      console.error('Successfully completed .NET analysis steps.');

    } catch (error: any) {
      let errorMessage = ` .NET analysis failed: ${error.message}`;
      if (error.stdout) errorMessage += `\nSTDOUT: ${error.stdout}`;
      if (error.stderr) errorMessage += `\nSTDERR: ${error.stderr}`;

      if (error.message.includes('dotnet: not found') || error.message.includes('command not found') || error.code === 'ENOENT') {
        errorMessage += '\n\n- Solution: Install .NET SDK:\n' +
                      '  - Download from: https://dotnet.microsoft.com/download\n';
      }
      throw new Error(errorMessage);
    } finally {
      await this.releaseLock(lockFile);
    }
  }


  /**
   * Acquire a file-based lock for sonar-scanner process
   */
  private async acquireLock(lockFile: string): Promise<void> {
    const maxWait = 120000; // 2 minutes max wait
    const checkInterval = 2000; // Check every 2 seconds
    let waited = 0;

    while (waited < maxWait) {
      const acquired = await this.tryAcquireLock(lockFile);
      if (acquired) {
        console.error('✅ Acquired sonar-scanner lock');
        return;
      }

      // Handle existing lock
      const shouldContinue = await this.handleExistingLock(lockFile, waited, checkInterval);
      if (shouldContinue) {
        waited += checkInterval;
        continue;
      }

      // If we couldn't handle the lock, wait and retry
      await this.sleep(checkInterval);
      waited += checkInterval;
    }

    throw new Error('Timeout waiting for sonar-scanner lock. Another analysis may be stuck.');
  }

  /**
   * Try to acquire lock by creating lock file
   */
  private async tryAcquireLock(lockFile: string): Promise<boolean> {
    try {
      await fs.writeFile(lockFile, JSON.stringify({
        pid: process.pid,
        timestamp: new Date().toISOString(),
        project: path.basename(path.dirname(lockFile))
      }), { flag: 'wx' }); // wx = create new file, fail if exists
      return true;
    } catch (error: any) {
      if (error.code === 'EEXIST') {
        return false; // Lock exists, need to wait
      }
      throw error; // Other errors should propagate
    }
  }

  /**
   * Handle existing lock file (check staleness, remove if needed)
   */
  private async handleExistingLock(
    lockFile: string,
    waited: number,
    checkInterval: number
  ): Promise<boolean> {
    try {
      const isStale = await this.isLockStale(lockFile);
      if (isStale) {
        console.error('⚠️  Removing stale lock file');
        await fs.unlink(lockFile);
        return true; // Continue to retry immediately
      }

      // Lock is valid, wait for it
      console.error(`⏳ Waiting for sonar-scanner to complete (${Math.round(waited/1000)}s)`);
      await this.sleep(checkInterval);
      return true; // Waited, continue loop
    } catch (error) {
      // Can't read lock file, try to remove it
      console.error(`Could not read lock file: ${error instanceof Error ? error.message : String(error)}`);
      return await this.tryRemoveCorruptedLock(lockFile, checkInterval);
    }
  }

  /**
   * Check if lock file is stale (older than 10 minutes)
   */
  private async isLockStale(lockFile: string): Promise<boolean> {
    const lockContent = await fs.readFile(lockFile, 'utf-8');
    const lockInfo = JSON.parse(lockContent);
    const lockAge = Date.now() - new Date(lockInfo.timestamp).getTime();
    return lockAge > 600000; // 10 minutes
  }

  /**
   * Try to remove corrupted lock file
   */
  private async tryRemoveCorruptedLock(lockFile: string, checkInterval: number): Promise<boolean> {
    try {
      await fs.unlink(lockFile);
    } catch (error) {
      // Can't remove, wait before retry
      console.error(`Could not remove corrupted lock file: ${error instanceof Error ? error.message : String(error)}`);
      await this.sleep(checkInterval);
    }
    return true; // Always continue retry loop
  }

  /**
   * Release the file-based lock
   */
  private async releaseLock(lockFile: string): Promise<void> {
    try {
      await fs.unlink(lockFile);
      console.error('✅ Released sonar-scanner lock');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('⚠️  Could not release lock file:', error.message);
      }
    }
  }

  /**
   * Fetch a single issue by key (efficient alternative to getIssues()+find).
   * Uses /api/issues/search with the `issues` parameter.
   */
  async getIssueByKey(issueKey: string, options?: { includeExtendedFields?: boolean }): Promise<SonarIssue | null> {
    const params: Record<string, any> = {
      componentKeys: this.projectKey,
      issues: issueKey,
      p: 1,
      ps: 1,
      // Cache-busting parameter to avoid stale results
      _t: Date.now(),
    };

    if (options?.includeExtendedFields) {
      params.additionalFields = '_all';
    }

    try {
      const response = await this.client.get('/api/issues/search', { params });
      const issue = response.data.issues?.[0];
      return issue ?? null;
    } catch (error: any) {
      console.error('Error fetching issue by key:', error.response?.status, error.response?.data);

      if (error.response?.status === 403) {
        let errorMessage = 'Permission denied when fetching issue details.';
        if (error.response?.data?.errors) {
          const errors = error.response.data.errors;
          errorMessage += ` SonarQube errors: ${errors.map((e: any) => e.msg).join(', ')}`;
        }
        errorMessage += '\n\n🔧 Possible solutions:\n' +
          '  1. Verify the token has "Browse" permission on the project\n' +
          '  2. Check if the issue exists and key is correct\n' +
          '  3. Ensure the token hasn\'t expired';
        throw new Error(errorMessage);
      }

      throw error;
    }
  }

  /**
   * Find similar issues already FIXED in this project for a given rule key.
   * NOTE: SonarQube does not provide a "diff" of the fix; this returns metadata only.
   */
  async getSimilarFixedIssues(ruleKey: string, maxResults: number = 3): Promise<SonarIssue[]> {
    const params: Record<string, any> = {
      componentKeys: this.projectKey,
      rules: ruleKey,
      issueStatuses: 'FIXED',
      p: 1,
      ps: Math.min(Math.max(1, maxResults), 500),
      _t: Date.now(),
    };

    try {
      const response = await this.client.get('/api/issues/search', { params });
      return response.data.issues ?? [];
    } catch (error: any) {
      console.error('Error fetching similar fixed issues:', error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * List test file components in the current project (best-effort).
   * Used as a fallback when local filesystem heuristics cannot find related tests.
   */
  async getProjectTestFiles(pageSize: number = 200): Promise<Array<{ key: string; path?: string; name?: string }>> {
    const params: Record<string, any> = {
      component: this.projectKey,
      qualifiers: 'UTS',
      ps: Math.min(Math.max(1, pageSize), 500),
    };

    try {
      const response = await this.client.get('/api/components/tree', { params });
      return response.data.components ?? [];
    } catch (error: any) {
      console.warn('Failed to fetch project test files:', error.response?.status, error.response?.data);
      return [];
    }
  }

  async getIssues(filter?: IssueFilter): Promise<SonarIssue[]> {
    const PAGE_SIZE = 500; // SonarQube max page size
    const baseParams: Record<string, any> = {
      componentKeys: this.projectKey,
      resolved: filter?.resolved ?? false,
      ps: PAGE_SIZE,
      // Force fresh results by adding cache-busting parameter
      _t: Date.now(),
      ...this.buildFilterParams(filter)
    };

    // Only include additionalFields when explicitly requested
    // This reduces response size and context window usage
    if (filter?.includeExtendedFields) {
      baseParams.additionalFields = '_all';
    }

    try {
      console.error('Fetching issues with pagination...');

      // First request to get total count
      const firstResponse = await this.client.get('/api/issues/search', {
        params: { ...baseParams, p: 1 }
      });

      const total = firstResponse.data.total ?? 0;
      const allIssues: SonarIssue[] = [...(firstResponse.data.issues ?? [])];

      console.error(`Found ${total} total issues (fetched page 1/${Math.ceil(total / PAGE_SIZE)})`);

      // Calculate remaining pages, capped at SonarQube's p*ps <= 10000 window.
      // Requesting pages past that window returns HTTP 400, which would reject
      // the whole parallel fetch on large projects.
      const MAX_PAGE = Math.floor(10000 / PAGE_SIZE);
      const totalPages = Math.ceil(total / PAGE_SIZE);
      const lastPage = Math.min(totalPages, MAX_PAGE);
      if (totalPages > MAX_PAGE) {
        console.error(
          `⚠️ Result set truncated: ${total} issues exceed SonarQube's 10000-result window; fetching the first ${MAX_PAGE * PAGE_SIZE}.`
        );
      }

      // Fetch remaining pages if needed (within the window)
      if (lastPage > 1) {
        console.error(`Fetching ${lastPage - 1} additional pages...`);

        // Create array of page numbers [2, 3, ..., lastPage]
        const remainingPages = Array.from({ length: lastPage - 1 }, (_, i) => i + 2);

        // Fetch all remaining pages in parallel for better performance
        const pagePromises = remainingPages.map(pageNum =>
          this.client.get('/api/issues/search', {
            params: { ...baseParams, p: pageNum }
          }).then(response => {
            console.error(`Fetched page ${pageNum}/${lastPage}`);
            return response.data.issues ?? [];
          })
        );

        const pageResults = await Promise.all(pagePromises);

        // Combine all issues
        pageResults.forEach(issues => allIssues.push(...issues));
      }

      console.error(`✅ Successfully fetched all ${allIssues.length} issues`);

      // Log last analysis date for debugging cache issues
      try {
        const projectResponse = await this.client.get('/api/projects/search', {
          params: { projects: this.projectKey }
        });

        const project = projectResponse.data.components?.[0];
        if (project?.lastAnalysisDate) {
          const lastAnalysis = new Date(project.lastAnalysisDate);
          const minutesAgo = Math.floor((Date.now() - lastAnalysis.getTime()) / 60000);
          console.error(`Last project analysis: ${lastAnalysis.toISOString()} (${minutesAgo} minutes ago)`);
        } else {
          console.error('No analysis date found for project');
        }
      } catch (projectError) {
        console.error(`Could not fetch project analysis date: ${projectError instanceof Error ? projectError.message : String(projectError)}`);
      }

      return allIssues;
    } catch (error: any) {
      console.error('Error fetching issues:', error.response?.status, error.response?.data);

      // Enhanced error handling for common permission issues
      if (error.response?.status === 403) {
        let errorMessage = 'Permission denied when fetching issues.';

        if (error.response?.data?.errors) {
          const errors = error.response.data.errors;
          errorMessage += ` SonarQube errors: ${errors.map((e: any) => e.msg).join(', ')}`;
        }

        errorMessage += '\n\n🔧 Possible solutions:\n' +
          '  1. Verify the token has "Browse" permission on the project\n' +
          '  2. Check if the project exists and key is correct\n' +
          '  3. Ensure the token hasn\'t expired\n' +
          '  4. Verify you\'re using a user token (not a global token)\n' +
          '  5. Check SonarQube logs for detailed permission errors';

        throw new Error(errorMessage);
      } else if (error.response?.status === 404) {
        throw new Error(`Project '${this.projectKey}' not found. Verify the project key is correct.`);
      }

      throw error;
    }
  }

  async getSourceContext(
    component: string,
    line: number,
    contextLines: number = 5
  ): Promise<string> {
    return this.sourceFetcher.getSourceContext(component, line, contextLines);
  }

  async getSourceLines(
    componentKey: string,
    from: number,
    to: number,
    options?: { bestEffort?: boolean }
  ): Promise<SonarLineCoverage[]> {
    return this.sourceFetcher.getSourceLines(componentKey, from, to, options);
  }

  async waitForAnalysis(timeout: number = 60000, ceTaskId?: string): Promise<void> {
    const startTime = Date.now();
    console.error(`Waiting for analysis completion (timeout: ${timeout}ms)...`);

    while (Date.now() - startTime < timeout) {
      try {
        const task = await this.checkTaskStatus(ceTaskId);
        if (!task) {
          await this.sleep(2000);
          continue;
        }

        const completed = await this.handleTaskStatus(task);
        if (completed) return;

        await this.sleep(2000);
      } catch (error: any) {
        this.handleAnalysisError(error);
      }
    }

    throw new Error(`Analysis timeout after ${timeout}ms`);
  }

  private async checkTaskStatus(ceTaskId?: string): Promise<any> {
    console.error('Checking analysis status...');

    // Prefer the analysis's own CE task by id (from report-task.txt), so we do
    // not read the status of a different/previous task on a shared project.
    if (ceTaskId) {
      const response = await this.client.get('/api/ce/task', { params: { id: ceTaskId } });
      const task = response.data.task;
      if (!task) {
        console.error('Task not found by id, waiting...');
        return null;
      }
      console.error(`Task status: ${task.status}, type: ${task.type}`);
      return task;
    }

    // Fallback: latest task for the project.
    const response = await this.client.get('/api/ce/activity', {
      params: { component: this.projectKey, ps: 1 }
    });

    const task = response.data.tasks[0];
    if (!task) {
      console.error('No tasks found, waiting...');
      return null;
    }

    console.error(`Task status: ${task.status}, type: ${task.type}`);
    return task;
  }

  /**
   * Read the Compute Engine task id from the scanner's report-task.txt, so the
   * analysis can be polled by its own task id. Returns null if not found.
   */
  async readCeTaskId(projectPath: string): Promise<string | null> {
    const candidates = [
      path.join(projectPath, '.scannerwork', 'report-task.txt'),
      path.join(projectPath, 'target', 'sonar', 'report-task.txt'),
      path.join(projectPath, 'build', 'sonar', 'report-task.txt'),
    ];
    for (const file of candidates) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const match = content.match(/^ceTaskId=(.+)$/m);
        if (match) return match[1].trim();
      } catch {
        // try next candidate location
      }
    }
    return null;
  }

  private async handleTaskStatus(task: any): Promise<boolean> {
    if (task.status === 'SUCCESS') {
      console.error('Analysis completed successfully');
      return true;
    }

    if (task.status === 'FAILED') {
      console.error('Analysis failed:', task.errorMessage);
      throw new Error(`Analysis failed: ${task.errorMessage ?? 'Unknown error'}`);
    }

    if (task.status === 'CANCELED') {
      throw new Error('Analysis was canceled');
    }

    console.error(`Task still ${task.status}, waiting...`);
    return false;
  }

  private handleAnalysisError(error: any): void {
    console.error('Error checking analysis status:', error.response?.status, error.response?.data);

    if (error.response?.status === 403) {
      throw new Error(this.build403ErrorMessage(error));
    }

    if (error.response?.status === 404) {
      throw new Error(`Project '${this.projectKey}' not found when checking analysis status.`);
    }

    throw error;
  }

  private build403ErrorMessage(error: any): string {
    let errorMessage = 'Permission denied when checking analysis status.';

    if (error.response?.data?.errors) {
      const errors = error.response.data.errors;
      errorMessage += ` SonarQube errors: ${errors.map((e: any) => e.msg).join(', ')}`;
    }

    errorMessage += '\n\n🔧 Possible solutions:\n' +
      '  1. Verify the token has "Execute Analysis" permission\n' +
      '  2. Check if you have "Browse" permission on the project\n' +
      '  3. Ensure the token belongs to a user with sufficient privileges\n' +
      '  4. Verify the project was created successfully\n' +
      '  5. Check if you need admin permissions for this operation';

    return errorMessage;
  }

  private buildFilterParams(filter?: IssueFilter): any {
    if (!filter) return {};

    return {
      types: filter.types?.join(','),
      severities: filter.severities?.join(','),
      languages: filter.languages?.join(','),
      rules: filter.rules?.join(','),
      since: filter.since,
      statuses: filter.statuses?.join(',') ?? 'OPEN,REOPENED',
      tags: filter.tags?.join(',')
    };
  }

  private getToken(): string {
    const auth = this.client.defaults.headers['Authorization'] as string;
    return auth.replace('Bearer ', '');
  }

  /**
   * Get the last scanner parameters that were built during triggerAnalysis.
   * Useful for generating properties file even when scan fails.
   */
  getLastBuiltScannerParams(): string[] {
    return this.lastBuiltScannerParams;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // SCANNER PARAMETER BUILDING HELPERS
  // ============================================================================

  /**
   * Build authentication parameters (always needed for CLI scanner)
   * Does NOT include projectKey - use buildBaseParams() for that
   */
  private buildAuthParams(): string[] {
    return [
      `-Dsonar.host.url=${this.client.defaults.baseURL}`,
      `-Dsonar.login=${this.getToken()}`,
      `-Dsonar.projectVersion=${Date.now()}`
    ];
  }

  /**
   * Build base parameters with project key (for when no properties file exists)
   */
  private buildBaseParams(): string[] {
    return [
      `-Dsonar.projectKey=${this.projectKey}`,
      ...this.buildAuthParams()
    ];
  }

  /**
   * Get missing critical properties from existing config
   * Returns only properties that are MISSING from the config file
   * @param projectPath Path to the project
   * @param detectedProperties Optional detected properties from analyzers
   */
  private async getMissingCriticalProperties(
    projectPath: string,
    detectedProperties?: Map<string, string>
  ): Promise<string[]> {
    const params: string[] = [];

    const preScanValidator = new PreScanValidator();
    const validationResult = await preScanValidator.validate(projectPath);

    if (validationResult.existingConfig?.missingCritical) {
      for (const missing of validationResult.existingConfig.missingCritical) {
        // First check in passed detected properties
        const detectedValue = detectedProperties?.get(missing);
        if (detectedValue) {
          params.push(`-D${missing}=${detectedValue}`);
          console.error(`  ➕ Adding missing critical: ${missing}=${detectedValue}`);
          continue;
        }
        // Otherwise check in validation-detected properties
        const detected = validationResult.detectedProperties.find(p => p.key === missing);
        if (detected) {
          params.push(`-D${missing}=${detected.value}`);
          console.error(`  ➕ Adding missing critical: ${missing}=${detected.value}`);
        }
      }
    }

    return params;
  }

  /**
   * Execute sonar-scanner CLI with given parameters
   * Separated from parameter building for clarity
   */
  private async runCliScanner(projectPath: string, params: string[]): Promise<string[]> {
    await this.paramBuilder.checkJavaCompilation(projectPath);

    const sanitizedParams = sanitizeCommandArgs(params);
    this.lastBuiltScannerParams = sanitizedParams;

    const command = 'sonar-scanner';
    console.error(`Running: ${command} with ${sanitizedParams.length} parameters`);
    console.error(`Masked token used: ${maskToken(this.getToken())}`);

    const { stdout, stderr } = await execAsync(
      `${command} ${sanitizedParams.map(arg => shellQuote(arg)).join(' ')}`,
      {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000, // 5 minutes
        env: { ...process.env, PATH: process.env.PATH }
      }
    );

    console.error('✅ SonarScanner CLI analysis completed successfully');
    if (stdout) console.error('Analysis output:', stdout);
    if (stderr) console.error('Analysis warnings:', stderr);

    return sanitizedParams;
  }

  // ============================================================================
  // END SCANNER PARAMETER BUILDING HELPERS
  // ============================================================================

  /**
   * Get detailed rule information from SonarQube
   * Uses caching to reduce API calls for repeated lookups
   */
  async getRuleDetails(ruleKey: string): Promise<SonarRuleDetails> {
    // Check cache first
    const cached = this.ruleCache.get(ruleKey);
    if (cached && cached.expires > Date.now()) {
      console.error(`[Cache HIT] Rule details for: ${ruleKey}`);
      return cached.data;
    }

    try {
      console.error(`[Cache MISS] Fetching rule details for: ${ruleKey}`);
      const response = await this.client.get('/api/rules/show', {
        params: {
          key: ruleKey,
          actives: true  // Include activation details
        }
      });

      const rule = response.data.rule;
      
      // Extract description sections if available (newer SonarQube versions)
      let descriptionSections: Array<{key: string, content: string}> = [];
      if (rule.descriptionSections) {
        descriptionSections = rule.descriptionSections;
      } else if (rule.mdDesc || rule.htmlDesc) {
        // Fallback for older versions
        descriptionSections = [{
          key: 'default',
          content: rule.mdDesc ?? rule.htmlDesc ?? rule.desc ?? ''
        }];
      }
      
      const ruleDetails: SonarRuleDetails = {
        key: rule.key,
        name: rule.name,
        htmlDesc: rule.htmlDesc,
        mdDesc: rule.mdDesc,
        severity: rule.severity ?? rule.defaultSeverity,
        status: rule.status,
        type: rule.type,
        tags: rule.tags ?? [],
        sysTags: rule.sysTags ?? [],
        lang: rule.lang,
        langName: rule.langName,
        remFnType: rule.remFnType,
        remFnBaseEffort: rule.remFnBaseEffort,
        defaultRemFnType: rule.defaultRemFnType,
        defaultRemFnBaseEffort: rule.defaultRemFnBaseEffort,
        effortToFixDescription: rule.effortToFixDescription,
        scope: rule.scope,
        isExternal: rule.isExternal,
        descriptionSections
      };

      // Cache the result with TTL
      this.ruleCache.set(ruleKey, {
        data: ruleDetails,
        expires: Date.now() + this.RULE_CACHE_TTL
      });

      return ruleDetails;
    } catch (error: any) {
      console.error('Error fetching rule details:', error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * Search for rules with optional filtering
   * Useful for finding related rules or understanding the rule landscape
   */
  async getRulesSearch(filter?: SonarRuleSearchFilter, page: number = 1, pageSize: number = 100): Promise<SonarRulesResponse> {
    try {
      const params: any = {
        p: page,
        ps: Math.min(pageSize, 500) // SonarQube max page size
      };

      // Add filtering parameters
      if (filter?.tags?.length) {
        params.tags = filter.tags.join(',');
      }
      if (filter?.languages?.length) {
        params.languages = filter.languages.join(',');
      }
      if (filter?.types?.length) {
        params.types = filter.types.join(',');
      }
      if (filter?.severities?.length) {
        params.severities = filter.severities.join(',');
      }
      if (filter?.statuses?.length) {
        params.statuses = filter.statuses.join(',');
      }
      if (filter?.isTemplate !== undefined) {
        params.isTemplate = filter.isTemplate;
      }
      if (filter?.searchQuery) {
        params.q = filter.searchQuery;
      }

      console.error(`Fetching rules with filters:`, { ...params, q: filter?.searchQuery ? '***' : undefined });

      const response = await this.client.get('/api/rules/search', { params });

      return {
        total: response.data.total,
        p: response.data.p,
        ps: response.data.ps,
        rules: response.data.rules ?? []
      };
    } catch (error: any) {
      console.error('Error fetching rules:', error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * Get detailed component information (file metrics, complexity, coverage, etc)
   */
  async getComponentDetails(componentKey: string, metrics?: string[]): Promise<SonarComponentDetails> {
    try {
      const defaultMetrics = [
        'ncloc',           // Lines of code
        'complexity',      // Cyclomatic complexity
        'duplicated_lines_density', // Duplication %
        'coverage',        // Test coverage
        'violations',      // Total issues
      ];

      const metricsToFetch = metrics?.length ? metrics : defaultMetrics;

      console.error(`Fetching component details for: ${componentKey}`);

      const response = await this.client.get('/api/measures/component', {
        params: {
          component: componentKey,
          metricKeys: metricsToFetch.join(',')
        }
      });

      const component = response.data.component;

      if (!component) {
        throw new Error(`Component ${componentKey} not found`);
      }

      return {
        key: component.key,
        name: component.name,
        qualifier: component.qualifier,
        path: component.path,
        description: component.description,
        measures: component.measures ?? []
      };
    } catch (error: any) {
      console.error('Error fetching component details:', error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * Get quality gate status for the project
   */
  async getQualityGateStatus(): Promise<SonarQualityGateStatus> {
    try {
      console.error(`[getQualityGateStatus] Fetching quality gate status for project: ${this.projectKey}`);
      const response = await this.client.get('/api/qualitygates/project_status', {
        params: {
          projectKey: this.projectKey
        }
      });

      const projectStatus = response.data.projectStatus;
      return {
        status: projectStatus.status,
        conditions: projectStatus.conditions || [],
        ignoredConditions: projectStatus.ignoredConditions || false,
        period: projectStatus.period,
        caycStatus: projectStatus.caycStatus
      };
    } catch (error: any) {
      console.error(`[getQualityGateStatus] Error for ${this.projectKey}:`, error.response?.status, error.response?.data?.errors);
      throw error;
    }
  }

  /**
   * Get rule details for all unique rules in a set of issues
   * Fetches rule info dynamically from SonarQube (no hardcoding!)
   *
   * @param issues - Array of issues to extract unique rules from
   * @param options - Options for lazy loading
   * @param options.includeDescriptions - Include rule descriptions (heavy ~2.5KB each).
   *        Default: false (for pattern analysis - saves ~50% tokens)
   *        Set to true for issue details where descriptions are needed
   */
  async getUniqueRulesInfo(
    issues: any[],
    options: { includeDescriptions?: boolean } = {}
  ): Promise<{ [key: string]: any }> {
    const { includeDescriptions = false } = options;

    try {
      // Extract unique rule keys
      const uniqueRules = new Set(issues.map(i => i.rule));
      console.error(`[getUniqueRulesInfo] Fetching details for ${uniqueRules.size} unique rules (includeDescriptions: ${includeDescriptions})`);

      const resultCache: { [key: string]: any } = {};

      // Fetch details for each unique rule (uses internal cache via getRuleDetails)
      for (const ruleKey of uniqueRules) {
        try {
          // Use getRuleDetails which has caching built-in
          const ruleDetails = await this.getRuleDetails(ruleKey);

          // Build compact rule info (without description by default)
          const ruleInfo: any = {
            key: ruleDetails.key,
            name: ruleDetails.name,
            type: ruleDetails.type,
            severity: ruleDetails.severity,
            status: ruleDetails.status,
            language: ruleDetails.langName || ruleDetails.lang,
            scope: ruleDetails.scope,
            isExternal: ruleDetails.isExternal || false,
            cleanCodeAttribute: (ruleDetails as any).cleanCodeAttribute,
            cleanCodeAttributeCategory: (ruleDetails as any).cleanCodeAttributeCategory,
            impacts: (ruleDetails as any).impacts || []
          };

          // Only include description if explicitly requested (lazy loading)
          if (includeDescriptions) {
            ruleInfo.description = ruleDetails.descriptionSections?.[0]?.content
              || ruleDetails.mdDesc
              || '';
          }

          resultCache[ruleKey] = ruleInfo;
        } catch (error: any) {
          console.error(`[getUniqueRulesInfo] Error fetching rule ${ruleKey}:`, error.response?.status);
          // Fallback: use minimal info from rule key
          resultCache[ruleKey] = {
            key: ruleKey,
            name: ruleKey,
            type: 'UNKNOWN',
            severity: 'UNKNOWN'
          };
        }
      }

      return resultCache;
    } catch (error: any) {
      console.error('[getUniqueRulesInfo] Error:', error.message);
      throw error;
    }
  }

  /**
   * Build parameters using language-specific defaults
   * Used when no sonar-project.properties exists and no detected properties available
   * NOTE: This method does NOT check for properties file - that's done in triggerCliAnalysis()
   */
  private async buildLanguageSpecificParams(projectPath: string): Promise<string[]> {
    return this.paramBuilder.build(projectPath, this.buildBaseParams());
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get security hotspots for the project
   */
  async getSecurityHotspots(filter?: {
    statuses?: Array<HotspotStatus>;
    resolutions?: Array<HotspotResolution>;
    severities?: Array<HotspotSeverity>;
  }): Promise<SonarSecurityHotspot[]> {
    // Default to just TO_REVIEW if no statuses specified
    const statusesToFetch = filter?.statuses ?? ['TO_REVIEW'];
    
    // SonarQube API only accepts one status at a time, so we need to make multiple calls
    const allHotspots: SonarSecurityHotspot[] = [];
    
    for (const status of statusesToFetch) {
      const params = {
        projectKey: this.projectKey,
        ps: 500,
        status: status, // Single status only
        // Force fresh results by adding cache-busting parameter
        _t: Date.now(),
        ...this.buildHotspotFilterParams({ ...filter, statuses: [status] })
      };

      try {
        console.error(`Fetching security hotspots with status: ${status}`);
        const response = await this.client.get('/api/hotspots/search', { params });
        const hotspots = response.data.hotspots ?? [];
        console.error(`Found ${hotspots.length} security hotspots with status: ${status}`);
        
        allHotspots.push(...hotspots);
      } catch (error: any) {
        console.error(`Error fetching security hotspots for status ${status}:`, error.response?.status, error.response?.data);
        // Continue with other statuses even if one fails
        continue;
      }
    }

    // Remove duplicates by key (in case of overlapping results)
    const uniqueHotspots = allHotspots.filter((hotspot, index, array) => 
      array.findIndex(h => h.key === hotspot.key) === index
    );

    console.error(`Total unique security hotspots found: ${uniqueHotspots.length}`);
    return uniqueHotspots;
  }

  /**
   * Get project metrics including duplication percentage
   */
  async getProjectMetrics(metrics?: string[]): Promise<SonarProjectMetrics> {
    const defaultMetrics = [
      'lines',
      'ncloc',
      'coverage',
      'duplicated_lines_density',
      'duplicated_lines',
      'duplicated_blocks',
      'duplicated_files',
      'complexity',
      'cognitive_complexity',
      'violations',
      'bugs',
      'vulnerabilities',
      'code_smells',
      'security_hotspots',
      'security_rating',
      'reliability_rating',
      'sqale_rating',
      'sqale_index',
      'alert_status',
      // Clean Code / Software Quality Impact metrics
      'reliability_issues',
      'maintainability_issues',
      'security_issues'
    ];

    const metricsToFetch = metrics ?? defaultMetrics;
    
    const params = {
      component: this.projectKey,
      metricKeys: metricsToFetch.join(',')
    };

    try {
      const response = await this.client.get('/api/measures/component', { params });
      
      const measures = response.data.component?.measures ?? [];
      
      // Convert to more readable format
      const metricsMap: { [key: string]: any } = {};
      measures.forEach((measure: any) => {
        metricsMap[measure.metric] = {
          value: measure.value,
          bestValue: measure.bestValue,
          periods: measure.periods
        };
      });
      
      return response.data;
    } catch (error: any) {
      console.error('Error fetching project metrics:', error.response?.status, error.response?.data);
      
      if (error.response?.status === 403) {
        let errorMessage = 'Permission denied when fetching project metrics.';
        
        if (error.response?.data?.errors) {
          const errors = error.response.data.errors;
          errorMessage += ` SonarQube errors: ${errors.map((e: any) => e.msg).join(', ')}`;
        }
        
        errorMessage += '\n\n🔧 Possible solutions:\n' +
          '  1. Verify the token has "Browse" permission on the project\n' +
          '  2. Check if the project exists and key is correct\n' +
          '  3. Ensure the token hasn\'t expired';
        
        throw new Error(errorMessage);
      } else if (error.response?.status === 404) {
        throw new Error(`Project '${this.projectKey}' not found when fetching metrics.`);
      }
      
      throw error;
    }
  }

  /**
   * Get detailed information for a specific security hotspot
   */
  async getSecurityHotspotDetails(hotspotKey: string): Promise<SonarSecurityHotspotDetails> {
    try {
      console.error(`Fetching details for hotspot: ${hotspotKey}`);
      const response = await this.client.get('/api/hotspots/show', { 
        params: { hotspot: hotspotKey } 
      });
      
      console.error(`Successfully retrieved details for hotspot: ${hotspotKey}`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching security hotspot details:', error.response?.status, error.response?.data);
      
      if (error.response?.status === 403) {
        let errorMessage = 'Permission denied when fetching security hotspot details.';
        
        if (error.response?.data?.errors) {
          const errors = error.response.data.errors;
          errorMessage += ` SonarQube errors: ${errors.map((e: any) => e.msg).join(', ')}`;
        }
        
        errorMessage += '\n\n🔧 Possible solutions:\n' +
          '  1. Verify the token has "Browse" permission on the project\n' +
          '  2. Check if the hotspot key is correct\n' +
          '  3. Ensure the hotspot exists and is accessible';
        
        throw new Error(errorMessage);
      } else if (error.response?.status === 404) {
        throw new Error(`Security hotspot '${hotspotKey}' not found.`);
      }
      
      throw error;
    }
  }

  /**
   * Build filter parameters for security hotspots
   */
  private buildHotspotFilterParams(filter?: {
    statuses?: Array<HotspotStatus>;
    resolutions?: Array<HotspotResolution>;
    severities?: Array<HotspotSeverity>;
  }): any {
    const params: any = {};
    
    // Note: Status is handled separately in getSecurityHotspots as API only accepts single status
    // Don't add status here - it's passed directly in the main params
    
    // Resolution filter (only if specified)
    if (filter?.resolutions && filter.resolutions.length > 0) {
      params.resolution = filter.resolutions.join(',');
    }
    
    // Severity filter (use vulnerabilityProbabilities for hotspots API)
    if (filter?.severities && filter.severities.length > 0) {
      params.vulnerabilityProbabilities = filter.severities.join(',');
    }
    
    return params;
  }

  /**
   * Get files with duplication metrics
   */
  async getFilesWithDuplication(pageSize: number = 100): Promise<SonarFilesWithDuplication> {
    const params = {
      component: this.projectKey,
      qualifiers: 'FIL',
      metricKeys: 'duplicated_lines_density,duplicated_lines,duplicated_blocks',
      ps: pageSize
    };

    try {
      const response = await this.client.get('/api/components/tree', { params });
      
      // Filter only files that have duplication metrics > 0
      const filesWithDuplication = response.data.components?.filter((file: any) => {
        const duplicatedLines = file.measures?.find((m: any) => m.metric === 'duplicated_lines');
        return duplicatedLines && parseFloat(duplicatedLines.value) > 0;
      }) ?? [];

      return {
        ...response.data,
        components: filesWithDuplication
      };
    } catch (error: any) {
      console.error('Error fetching files with duplication:', error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * Get detailed duplication information for a specific file
   */
  async getDuplicationDetails(fileKey: string): Promise<SonarDuplicationDetails> {
    const params = {
      key: fileKey
    };

    try {
      const response = await this.client.get('/api/duplications/show', { params });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching duplication details:', error.response?.status, error.response?.data);

      if (error.response?.status === 404) {
        throw new Error(`File '${fileKey}' not found or has no duplications.`);
      }

      throw error;
    }
  }

  /**
   * Get line-by-line coverage information for a component (file)
   * Uses /api/sources/lines endpoint which returns coverage data per line
   *
   * @param componentKey - The SonarQube component key (e.g., "project:src/main/java/Example.java")
   * @param from - Optional starting line number
   * @param to - Optional ending line number
   * @returns Array of line coverage data
   *
   * Coverage interpretation:
   * - lineHits undefined: Line is not executable (comments, blank lines, declarations)
   * - lineHits === 0: Line is executable but NOT covered by tests
   * - lineHits > 0: Line is covered (value indicates number of test hits)
   * - conditions > coveredConditions: Partial branch coverage
   */
  async getLineCoverage(componentKey: string, from?: number, to?: number): Promise<SonarLineCoverage[]> {
    const params: Record<string, string | number> = {
      key: componentKey
    };

    // Add optional pagination parameters
    if (from !== undefined) {
      params.from = from;
    }
    if (to !== undefined) {
      params.to = to;
    }

    try {
      console.error(`[getLineCoverage] Fetching coverage for: ${componentKey}`);
      const response = await this.client.get('/api/sources/lines', { params });

      const sources = response.data.sources ?? [];
      console.error(`[getLineCoverage] Retrieved ${sources.length} lines of coverage data`);

      return sources;
    } catch (error: any) {
      console.error('[getLineCoverage] Error:', error.response?.status, error.response?.data);

      if (error.response?.status === 403) {
        let errorMessage = 'Permission denied when fetching line coverage.';

        if (error.response?.data?.errors) {
          const errors = error.response.data.errors;
          errorMessage += ` SonarQube errors: ${errors.map((e: any) => e.msg).join(', ')}`;
        }

        errorMessage += '\n\n🔧 Possible solutions:\n' +
          '  1. Verify the token has "Browse" permission on the project\n' +
          '  2. Check if the component key is correct\n' +
          '  3. Ensure the file exists in the project';

        throw new Error(errorMessage);
      } else if (error.response?.status === 404) {
        throw new Error(`Component '${componentKey}' not found. Verify the component key is correct.`);
      }

      throw error;
    }
  }

  /**
   * Get comprehensive technical debt analysis
   */
  async getTechnicalDebtAnalysis(): Promise<{
    totalDebt: number; // in minutes
    debtRatio: number; // percentage
    maintainabilityRating: string;
    effortToReachA: number; // minutes to reach rating A
    breakdown: {
      bugs: number;
      vulnerabilities: number;
      codeSmells: number;
    };
    recommendations: string[];
  }> {
    try {
      const metrics = await this.getProjectMetrics([
        'sqale_index',
        'sqale_debt_ratio', 
        'sqale_rating',
        'effort_to_reach_maintainability_rating_a',
        'bugs',
        'vulnerabilities', 
        'code_smells'
      ]);

      const metricsMap: { [key: string]: any } = {};
      metrics.component.measures.forEach((measure: any) => {
        metricsMap[measure.metric] = measure;
      });

      const totalDebt = parseInt(metricsMap.sqale_index?.value ?? '0');
      const debtRatio = parseFloat(metricsMap.sqale_debt_ratio?.value ?? '0');
      const maintainabilityRating = metricsMap.sqale_rating?.value ?? '0';
      const effortToReachA = parseInt(metricsMap.effort_to_reach_maintainability_rating_a?.value ?? '0');

      const bugs = parseInt(metricsMap.bugs?.value ?? '0');
      const vulnerabilities = parseInt(metricsMap.vulnerabilities?.value ?? '0');
      const codeSmells = parseInt(metricsMap.code_smells?.value ?? '0');

      // Generate recommendations based on debt levels
      const recommendations: string[] = [];
      
      if (totalDebt === 0) {
        recommendations.push("🎉 Excellent! No technical debt detected");
        recommendations.push("💚 Continue following clean code practices");
      } else if (totalDebt < 60) { // Less than 1 hour
        recommendations.push("✅ Low technical debt - well maintained codebase");
        recommendations.push("🔄 Regular refactoring sessions to keep debt low");
      } else if (totalDebt < 480) { // Less than 8 hours (1 day)
        recommendations.push("⚠️ Moderate technical debt detected");
        recommendations.push("📅 Schedule dedicated refactoring time this sprint");
      } else if (totalDebt < 2400) { // Less than 40 hours (1 week)
        recommendations.push("🚨 High technical debt - requires immediate attention");
        recommendations.push("🎯 Prioritize debt reduction in next iteration");
      } else {
        recommendations.push("💥 Critical technical debt level!");
        recommendations.push("🛑 Consider major refactoring or rewrite for affected areas");
      }

      if (debtRatio > 5.0) {
        recommendations.push("📈 Debt ratio is high - balance new features with refactoring");
      }

      if (codeSmells > bugs + vulnerabilities && codeSmells > 10) {
        recommendations.push("🧹 Many code smells detected - focus on code quality improvements");
      }

      if (bugs > 0) {
        recommendations.push(`🐛 ${bugs} bug(s) need immediate attention`);
      }

      if (vulnerabilities > 0) {
        recommendations.push(`🔒 ${vulnerabilities} security issue(s) require urgent fixes`);
      }

      return {
        totalDebt,
        debtRatio,
        maintainabilityRating,
        effortToReachA,
        breakdown: {
          bugs,
          vulnerabilities,
          codeSmells
        },
        recommendations
      };
    } catch (error: any) {
      console.error('Error fetching technical debt analysis:', error.message);
      throw error;
    }
  }

  /**
   * Get duplication summary with recommendations
   */
  async getDuplicationSummary(): Promise<{
    filesWithDuplication: SonarFilesWithDuplication;
    totalFiles: number;
    duplicatedLines: number;
    duplicatedBlocks: number;
    recommendations: string[];
  }> {
    try {
      const filesWithDuplication = await this.getFilesWithDuplication();
      const metrics = await this.getProjectMetrics(['duplicated_lines', 'duplicated_blocks', 'duplicated_files']);
      
      const duplicatedLinesMetric = metrics.component.measures?.find(m => m.metric === 'duplicated_lines');
      const duplicatedBlocksMetric = metrics.component.measures?.find(m => m.metric === 'duplicated_blocks');
      
      const duplicatedLines = duplicatedLinesMetric ? parseInt(duplicatedLinesMetric.value) : 0;
      const duplicatedBlocks = duplicatedBlocksMetric ? parseInt(duplicatedBlocksMetric.value) : 0;
      
      // Generate recommendations based on duplication levels
      const recommendations: string[] = [];
      
      if (duplicatedLines > 500) {
        recommendations.push("🚨 High duplication detected (>500 lines). Consider immediate refactoring.");
      } else if (duplicatedLines > 200) {
        recommendations.push("⚠️ Moderate duplication detected (>200 lines). Plan refactoring tasks.");
      }
      
      if (duplicatedBlocks > 10) {
        recommendations.push("📦 Extract common code blocks into reusable methods or classes.");
      }
      
      if (filesWithDuplication.components.length > 5) {
        recommendations.push("🔄 Consider using inheritance, composition, or shared utilities to reduce duplication.");
      }
      
      recommendations.push("💡 Focus on files with highest duplication density first.");
      recommendations.push("🛠️ Use IDE refactoring tools to safely extract duplicated code.");
      
      return {
        filesWithDuplication,
        totalFiles: filesWithDuplication.components.length,
        duplicatedLines,
        duplicatedBlocks,
        recommendations
      };
    } catch (error: any) {
      console.error('Error generating duplication summary:', error.message);
      throw error;
    }
  }

  /**
   * Get files with coverage gaps
   *
   * Identifies files below target coverage threshold and categorizes them:
   * - Files with coverage data (can calculate exact coverage %)
   * - Files without coverage data (need coverage setup first)
   *
   * Uses /api/components/tree with coverage metrics.
   *
   * @param options Configuration options
   * @returns Files with coverage gaps and setup requirements
   */
  async getFilesWithCoverageGaps(options: {
    targetCoverage?: number;
    maxFiles?: number;
    sortBy?: 'coverage' | 'uncovered_lines' | 'name';
    includeNoCoverageData?: boolean;
  } = {}): Promise<FilesWithCoverageGaps> {
    const {
      targetCoverage = 100,
      maxFiles = 50,
      sortBy = 'coverage',
      includeNoCoverageData = false
    } = options;

    const params = {
      component: this.projectKey,
      qualifiers: 'FIL',
      metricKeys: 'coverage,uncovered_lines,lines_to_cover',
      ps: Math.min(maxFiles * 2, 500) // Fetch more to account for filtering
    };

    try {
      // IMPORTANT: Use /api/measures/component_tree instead of /api/components/tree
      // The latter does NOT return measures even when metricKeys is specified
      const response = await this.client.get('/api/measures/component_tree', { params });
      const allFiles = response.data.components ?? [];

      // Categorize files
      const filesWithCoverageData: FileWithCoverage[] = [];
      const filesWithoutCoverageData: string[] = [];

      for (const file of allFiles) {
        const coverageMetric = file.measures?.find((m: any) => m.metric === 'coverage');
        const linesToCoverMetric = file.measures?.find((m: any) => m.metric === 'lines_to_cover');
        const uncoveredLinesMetric = file.measures?.find((m: any) => m.metric === 'uncovered_lines');

        // Check if file has valid coverage data
        const hasLinesToCover = linesToCoverMetric && parseFloat(linesToCoverMetric.value) > 0;

        if (coverageMetric !== undefined && hasLinesToCover) {
          // File has coverage data
          const coverage = parseFloat(coverageMetric.value);
          const uncoveredLines = uncoveredLinesMetric ? parseInt(uncoveredLinesMetric.value) : 0;
          const linesToCover = parseInt(linesToCoverMetric.value);

          // Filter by target coverage
          if (coverage < targetCoverage) {
            filesWithCoverageData.push({
              key: file.key,
              path: file.path,
              name: file.name,
              language: file.language ?? 'unknown',
              coverage,
              uncoveredLines,
              linesToCover,
              hasCoverageData: true,
              priority: this.calculateCoveragePriority(coverage, uncoveredLines)
            });
          }
        } else if (includeNoCoverageData && file.path) {
          // File without coverage data - potentially never tested
          filesWithoutCoverageData.push(file.path);
        }
      }

      // Sort files
      filesWithCoverageData.sort((a, b) => {
        switch (sortBy) {
          case 'uncovered_lines':
            return b.uncoveredLines - a.uncoveredLines; // Most uncovered first
          case 'name':
            return a.name.localeCompare(b.name);
          case 'coverage':
          default:
            return a.coverage - b.coverage; // Lowest coverage first
        }
      });

      // Limit results
      const limitedFiles = filesWithCoverageData.slice(0, maxFiles);

      // Calculate average coverage
      const averageCoverage = limitedFiles.length > 0
        ? Math.round(limitedFiles.reduce((sum, f) => sum + f.coverage, 0) / limitedFiles.length)
        : 0;

      // Determine if project has any coverage report
      // hasCoverageReport is true if at least one file has coverage data
      const hasCoverageReport = filesWithCoverageData.length > 0 ||
        (allFiles.length > 0 && filesWithoutCoverageData.length < allFiles.length);

      return {
        totalFiles: allFiles.length,
        filesAnalyzed: filesWithCoverageData.length,
        filesWithGaps: limitedFiles.length,
        filesWithoutCoverageData: filesWithoutCoverageData.length,
        averageCoverage,
        files: limitedFiles,
        filesNeedingCoverageSetup: filesWithoutCoverageData.slice(0, 20), // Limit to first 20
        hasCoverageReport
      };
    } catch (error: any) {
      console.error('Error fetching files with coverage gaps:', error.response?.status, error.response?.data);
      throw error;
    }
  }

  /**
   * Calculate priority based on coverage level
   * @param coverage Coverage percentage (0-100)
   * @param uncoveredLines Number of uncovered lines
   * @returns Priority level
   */
  private calculateCoveragePriority(coverage: number, uncoveredLines: number): CoveragePriority {
    if (coverage === 0) return 'critical'; // Zero coverage = highest priority
    if (coverage < 30 || uncoveredLines > 100) return 'high';
    if (coverage < 60 || uncoveredLines > 50) return 'medium';
    return 'low';
  }
}

/**
 * Verify project setup after creation
 */
export async function verifyProjectSetup(projectKey: string, token: string): Promise<void> {
  console.error('🔍 Verifying project setup...');
  
  // Create a temporary client to test permissions
  const tempClient = new SonarQubeClient(
    process.env.SONAR_URL ?? 'http://localhost:9000',
    token,
    projectKey
  );

  // Test 1: Project exists and is accessible
  try {
    const projectResponse = await tempClient.client.get('/api/projects/search', { 
      params: { projects: projectKey } 
    });
    if (!projectResponse.data.components?.length) {
      throw new Error(`Project ${projectKey} not found after creation`);
    }
    console.error('✅ Project exists and is accessible');
  } catch (error: any) {
    console.warn('⚠️  Project accessibility check failed:', error.message);
    // Don't fail completely, but warn
  }

  // Test 2: Can access compute engine (analysis permissions)
  try {
    await tempClient.client.get('/api/ce/activity', { 
      params: { component: projectKey, ps: 1 } 
    });
    console.error('✅ Analysis permissions verified');
  } catch (error: any) {
    console.warn('⚠️  Analysis permission check failed:', error.message);
    
    // Wait a bit and retry once (timing issue)
    console.error('⏳ Retrying permission check in 3 seconds...');
    await sleep(3000);
    
    try {
      await tempClient.client.get('/api/ce/activity', { 
        params: { component: projectKey, ps: 1 } 
      });
      console.error('Analysis permissions verified (after retry)');
    } catch (retryError: any) {
      console.error('Analysis permissions still failing after retry');
      console.error('Attempting fallback verification with basic project access...');
      
      // Fallback: Just check if we can access project info (less restrictive)
      try {
        await tempClient.client.get('/api/projects/search', { 
          params: { projects: projectKey } 
        });
        console.error('Basic project access verified - proceeding with limited permissions');
        console.warn('NOTE: Analysis permissions may be limited, but project is accessible');
      } catch (fallbackError: any) {
        console.error(`Fallback verification failed: ${fallbackError.message}`);
        throw new Error(
          `Project created but permissions unavailable: ${retryError.message}\n\n` +
          `MANUAL FIX: Go to ${process.env.SONAR_URL ?? 'http://localhost:9000'}/projects and verify project permissions`
        );
      }
    }
  }

  console.error('🎉 Project setup verification complete');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for SonarQube cache refresh with verification
 */
export async function waitForCacheRefresh(sonarClient: any): Promise<void> {
  const maxWaitTime = 15000; // 15 seconds max
  const checkInterval = 2000; // Check every 2 seconds
  const minWaitTime = 5000; // Always wait at least 5 seconds
  
  // First, always wait minimum time
  await sleep(minWaitTime);
  
  let waited = minWaitTime;
  let previousIssueCount = -1;
  
  while (waited < maxWaitTime) {
    try {
      // Try to get fresh issues
      const currentIssues = await sonarClient.getIssues();
      const currentCount = currentIssues.length;
      
      console.error(`📊 Current issue count: ${currentCount} (previous: ${previousIssueCount})`);
      
      // A stable NON-ZERO count means indexing has settled. A stable count of
      // zero can just be the Compute Engine still indexing, so it must not be
      // mistaken for a clean scan (would return an empty result prematurely).
      if (previousIssueCount >= 0 && currentCount === previousIssueCount && currentCount > 0) {
        console.error('✅ Issue count stable, cache refreshed');
        return;
      }
      
      previousIssueCount = currentCount;
      await sleep(checkInterval);
      waited += checkInterval;
      
    } catch (error) {
      // If we can't fetch issues, wait a bit more
      console.error(`⚠️ Issue fetch failed: ${error instanceof Error ? error.message : String(error)}, waiting longer...`);
      await sleep(checkInterval);
      waited += checkInterval;
    }
  }
  
  console.error(`⏰ Cache refresh timeout after ${waited}ms, proceeding anyway`);
}
