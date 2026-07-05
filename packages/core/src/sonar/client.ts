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
import { SonarRuleApi } from './api/SonarRuleApi.js';
import { SonarIssueApi } from './api/SonarIssueApi.js';
import { SonarMeasureApi } from './api/SonarMeasureApi.js';
import { ScannerParameterBuilder } from './scanner/ScannerParameterBuilder.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export class SonarQubeClient {
  public readonly client: AxiosInstance;  // Make public for diagnostic access
  private readonly projectKey: string;
  public readonly projectContext?: ProjectContext;
  private readonly paramBuilder: ScannerParameterBuilder;
  private readonly sourceFetcher: SonarSourceFetcher;
  private readonly ruleApi: SonarRuleApi;
  private readonly issueApi: SonarIssueApi;
  private readonly measureApi: SonarMeasureApi;

  /**
   * Rule details cache with TTL
   * Reduces API calls for repeated rule lookups (e.g., during pattern analysis)
   */


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
    this.ruleApi = new SonarRuleApi(this.client);
    this.issueApi = new SonarIssueApi(this.client, this.projectKey);
    this.measureApi = new SonarMeasureApi(this.client, this.projectKey);

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
    return this.issueApi.getIssueByKey(issueKey, options);
  }

  async getSimilarFixedIssues(ruleKey: string, maxResults: number = 3): Promise<SonarIssue[]> {
    return this.issueApi.getSimilarFixedIssues(ruleKey, maxResults);
  }

  async getProjectTestFiles(pageSize: number = 200): Promise<Array<{ key: string; path?: string; name?: string }>> {
    return this.issueApi.getProjectTestFiles(pageSize);
  }

  async getIssues(filter?: IssueFilter): Promise<SonarIssue[]> {
    return this.issueApi.getIssues(filter);
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
    return this.ruleApi.getRuleDetails(ruleKey);
  }

  async getRulesSearch(filter?: SonarRuleSearchFilter, page: number = 1, pageSize: number = 100): Promise<SonarRulesResponse> {
    return this.ruleApi.getRulesSearch(filter, page, pageSize);
  }

  async getUniqueRulesInfo(
    issues: any[],
    options: { includeDescriptions?: boolean } = {}
  ): Promise<{ [key: string]: any }> {
    return this.ruleApi.getUniqueRulesInfo(issues, options);
  }

  /**
   * Get detailed component information (file metrics, complexity, coverage, etc)
   */
  async getComponentDetails(componentKey: string, metrics?: string[]): Promise<SonarComponentDetails> {
    return this.measureApi.getComponentDetails(componentKey, metrics);
  }

  async getQualityGateStatus(): Promise<SonarQualityGateStatus> {
    return this.measureApi.getQualityGateStatus();
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
    return this.measureApi.getSecurityHotspots(filter);
  }

  async getProjectMetrics(metrics?: string[]): Promise<SonarProjectMetrics> {
    return this.measureApi.getProjectMetrics(metrics);
  }

  async getSecurityHotspotDetails(hotspotKey: string): Promise<SonarSecurityHotspotDetails> {
    return this.measureApi.getSecurityHotspotDetails(hotspotKey);
  }

  async getFilesWithDuplication(pageSize: number = 100): Promise<SonarFilesWithDuplication> {
    return this.measureApi.getFilesWithDuplication(pageSize);
  }

  async getDuplicationDetails(fileKey: string): Promise<SonarDuplicationDetails> {
    return this.measureApi.getDuplicationDetails(fileKey);
  }

  async getLineCoverage(componentKey: string, from?: number, to?: number): Promise<SonarLineCoverage[]> {
    return this.measureApi.getLineCoverage(componentKey, from, to);
  }

  async getTechnicalDebtAnalysis() {
    return this.measureApi.getTechnicalDebtAnalysis();
  }

  async getDuplicationSummary() {
    return this.measureApi.getDuplicationSummary();
  }

  async getFilesWithCoverageGaps(options: {
    targetCoverage?: number;
    maxFiles?: number;
    sortBy?: 'coverage' | 'uncovered_lines' | 'name';
    includeNoCoverageData?: boolean;
  } = {}): Promise<FilesWithCoverageGaps> {
    return this.measureApi.getFilesWithCoverageGaps(options);
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
