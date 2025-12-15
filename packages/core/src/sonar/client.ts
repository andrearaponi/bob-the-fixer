import axios, { AxiosInstance } from 'axios';
import { SonarIssue, IssueFilter, SonarRuleDetails, SonarSecurityHotspot, SonarProjectMetrics, SonarSecurityHotspotDetails, SonarFilesWithDuplication, SonarDuplicationDetails, HotspotStatus, HotspotResolution, HotspotSeverity, SonarRuleSearchFilter, SonarRulesResponse, SonarComponentDetails, SonarQualityGateStatus, SonarLineCoverage, FileWithCoverage, FilesWithCoverageGaps, CoveragePriority } from './types';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectContext } from '../universal/project-manager';
import { sanitizeCommandArgs, shellQuote, sanitizeProjectKey, sanitizeUrl, maskToken } from '../infrastructure/security/input-sanitization.js';
import { PreScanValidator } from '../core/scanning/validation/index.js';
import { selectScanner, ScannerType, buildMavenCommand, buildGradleCommand, getScannerDescription, ScannerOptions } from './scanner-selection.js';

const execAsync = promisify(exec);

export class SonarQubeClient {
  public readonly client: AxiosInstance;  // Make public for diagnostic access
  private readonly projectKey: string;
  public readonly projectContext?: ProjectContext;

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
    
    const sanitizedUrl = sanitizeUrl(baseUrl);
    
    this.client = axios.create({
      baseURL: sanitizedUrl,
      headers: {
        'Authorization': `Bearer ${token}`, // Token validation happens in token manager
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    // Add response interceptor to handle 401 errors
    this.client.interceptors.response.use(
      response => response,
      (error: Error) => {
        if ((error as any).response?.status === 401) {
          const tokenInfo = token ? `Token present (${token.substring(0, 10)}...)` : 'NO TOKEN';
          const envToken = process.env.SONAR_TOKEN;
          const envInfo = envToken ? `Env token: ${envToken.substring(0, 10)}...` : 'NO ENV TOKEN';

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
      await this.checkJavaCompilation(projectPath);

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
      await this.checkJavaCompilation(projectPath);

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


      const beginArgs = [
        'sonarscanner',
        'begin',
        `/k:"${this.projectKey}"`,
        `/d:sonar.host.url="${this.client.defaults.baseURL}"`,
        `/d:sonar.login="${this.getToken()}"`,
        `/d:sonar.verbose="true"`,
      ];
      
      if (solutionFile) {
        beginArgs.push(`/d:sonar.solution="${solutionFile}"`);
      }

      const beginCommand = `dotnet ${beginArgs.join(' ')}`;
      
      console.error(`Running .NET analysis step 1 (begin): ${beginCommand}`);
      await execAsync(beginCommand, { cwd: safePath, maxBuffer: 10 * 1024 * 1024 });

      const buildCommand = solutionFile ? `dotnet build ${shellQuote(solutionFile)}` : 'dotnet build';
      console.error(`Running .NET analysis step 2 (build): ${buildCommand}`);
      await execAsync(buildCommand, { cwd: safePath, maxBuffer: 10 * 1024 * 1024 });

      const endArgs = [
        'sonarscanner',
        'end',
        `/d:sonar.login="${this.getToken()}"`,
      ];
      const endCommand = `dotnet ${endArgs.join(' ')}`;
      console.error(`Running .NET analysis step 3 (end): ${endCommand}`);
      await execAsync(endCommand, { cwd: safePath, maxBuffer: 10 * 1024 * 1024 });

      console.error('Successfully completed .NET analysis steps.');

    } catch (error: any) {
      let errorMessage = ` .NET analysis failed: ${error.message}`;
      if (error.stdout) errorMessage += `\nSTDOUT: ${error.stdout}`;
      if (error.stderr) errorMessage += `\nSTDERR: ${error.stderr}`;
      
      if (error.message.includes('dotnet: not found') || error.message.includes('command not found')) {
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

      // Calculate remaining pages
      const totalPages = Math.ceil(total / PAGE_SIZE);

      // Fetch remaining pages if needed
      if (totalPages > 1) {
        console.error(`Fetching ${totalPages - 1} additional pages...`);

        // Create array of page numbers [2, 3, 4, ...]
        const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

        // Fetch all remaining pages in parallel for better performance
        const pagePromises = remainingPages.map(pageNum =>
          this.client.get('/api/issues/search', {
            params: { ...baseParams, p: pageNum }
          }).then(response => {
            console.error(`Fetched page ${pageNum}/${totalPages}`);
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
    try {
      // Use /api/sources/raw for clean code without HTML markup
      const response = await this.client.get('/api/sources/raw', {
        params: {
          key: component
        }
      });

      if (!response.data) {
        return '';
      }

      // Split the raw code into lines and extract the context range
      const allLines = response.data.split('\n');
      const startLine = Math.max(0, line - contextLines - 1);
      const endLine = Math.min(allLines.length, line + contextLines);

      // Extract the context lines and rejoin
      const contextLines_array = allLines.slice(startLine, endLine);
      return contextLines_array.join('\n');
    } catch (error: any) {
      // Fallback: if raw endpoint fails, return empty string
      console.warn(`Failed to fetch raw source for ${component}:`, error.message);
      return '';
    }
  }

  async waitForAnalysis(timeout: number = 60000): Promise<void> {
    const startTime = Date.now();
    console.error(`Waiting for analysis completion (timeout: ${timeout}ms)...`);

    while (Date.now() - startTime < timeout) {
      try {
        const task = await this.checkTaskStatus();
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

  private async checkTaskStatus(): Promise<any> {
    console.error('Checking analysis status...');
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
    await this.checkJavaCompilation(projectPath);

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
    const params = this.buildBaseParams();

    if (!this.projectContext) {
      // Fallback to basic parameters
      params.push(`-Dsonar.sources=${projectPath}`);
      return params;
    }

    const language = this.projectContext.language;
    const buildTool = this.projectContext.buildTool;

    // IMPORTANT: Check JavaScript/TypeScript BEFORE Java
    // because 'javascript' contains 'java' as substring
    if (language.includes('javascript') || language.includes('typescript')) {
      await this.addJavaScriptParameters(params, projectPath);
    }
    // Java-specific parameters
    else if (language.includes('java')) {
      await this.addJavaParameters(params, projectPath, buildTool);
    }
    // C/C++ parameters
    else if (language.includes('c++') || language.includes('cpp') || language.includes('c')) {
      await this.addCCppParameters(params, projectPath);
    }
    // Python parameters
    else if (language.includes('python')) {
      await this.addPythonParameters(params, projectPath);
    }
    // Go parameters
    else if (language.includes('go')) {
      await this.addGoParameters(params, projectPath);
    }
    // Generic parameters
    else {
      params.push(`-Dsonar.sources=${projectPath}`);
    }

    return params;
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
   * Check if a directory contains Python files (recursively, max 2 levels)
   */
  private async directoryContainsPythonFiles(dirPath: string): Promise<boolean> {
    try {
      await fs.access(dirPath);
    } catch {
      return false; // Directory doesn't exist
    }

    const checkDir = async (dir: string, depth: number): Promise<boolean> => {
      if (depth > 2) return false;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === '__pycache__' ||
              entry.name === 'venv' || entry.name === 'env' || entry.name === 'node_modules') {
            continue;
          }

          if (entry.isFile() && entry.name.endsWith('.py')) {
            return true;
          }

          if (entry.isDirectory()) {
            if (await checkDir(path.join(dir, entry.name), depth + 1)) {
              return true;
            }
          }
        }
      } catch {
        // Ignore errors
      }

      return false;
    };

    return checkDir(dirPath, 0);
  }

  /**
   * Add Java-specific parameters
   */
  private async addJavaParameters(params: string[], projectPath: string, buildTool?: string): Promise<void> {
    // Add source and binary parameters based on build tool
    if (buildTool === 'maven') {
      await this.addMavenJavaParameters(params, projectPath);
    } else if (buildTool === 'gradle') {
      await this.addGradleJavaParameters(params, projectPath);
    } else {
      await this.addGenericJavaParameters(params, projectPath);
    }

    // Add Java version detection from build configuration (pom.xml/build.gradle)
    await this.addJavaVersionParameter(params, projectPath, buildTool);
  }

  /**
   * Add Maven-specific Java parameters
   */
  private async addMavenJavaParameters(params: string[], projectPath: string): Promise<void> {
    params.push('-Dsonar.sources=src/main/java');

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'src/test/java',
      '-Dsonar.tests=src/test/java',
      'Maven test directory'
    );

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'target/classes',
      '-Dsonar.java.binaries=target/classes',
      'Maven target/classes'
    );

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'target/test-classes',
      '-Dsonar.java.test.binaries=target/test-classes',
      'Maven target/test-classes'
    );

    // Add Maven dependencies (libraries)
    await this.addMavenLibraries(params, projectPath);

    // Add JaCoCo coverage report paths if they exist
    await this.addJacocoCoverageParams(params, projectPath);
  }

  /**
   * Add JaCoCo coverage report paths for Maven/Gradle projects
   */
  private async addJacocoCoverageParams(params: string[], projectPath: string): Promise<void> {
    // Common JaCoCo report paths to check
    const jacocoPaths = [
      'target/site/jacoco/jacoco.xml',
      'target/jacoco-report/jacoco.xml',
      'target/jacoco/jacoco.xml',
      'build/reports/jacoco/test/jacocoTestReport.xml',
      'build/jacoco/test.xml'
    ];

    const foundPaths: string[] = [];
    for (const jacocoPath of jacocoPaths) {
      if (await this.fileExists(path.join(projectPath, jacocoPath))) {
        foundPaths.push(jacocoPath);
      }
    }

    if (foundPaths.length > 0) {
      params.push(`-Dsonar.coverage.jacoco.xmlReportPaths=${foundPaths.join(',')}`);
      console.error(`📊 Found JaCoCo reports: ${foundPaths.join(', ')}`);
    }
  }

  /**
   * Add Gradle-specific Java parameters
   */
  private async addGradleJavaParameters(params: string[], projectPath: string): Promise<void> {
    params.push('-Dsonar.sources=src/main/java');

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'src/test/java',
      '-Dsonar.tests=src/test/java',
      'Gradle test directory'
    );

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'build/classes/java/main',
      '-Dsonar.java.binaries=build/classes/java/main',
      'Gradle build/classes'
    );

    await this.addDirectoryIfExists(
      params,
      projectPath,
      'build/classes/java/test',
      '-Dsonar.java.test.binaries=build/classes/java/test',
      'Gradle build test classes'
    );

    // Add Gradle dependencies (libraries)
    await this.addGradleLibraries(params, projectPath);

    // Add JaCoCo coverage report paths if they exist
    await this.addJacocoCoverageParams(params, projectPath);
  }

  /**
   * Add generic Java parameters with auto-detection
   */
  private async addGenericJavaParameters(params: string[], projectPath: string): Promise<void> {
    const javaSources = await this.detectJavaSourceDirs(projectPath);
    const javaTests = await this.detectJavaTestDirs(projectPath);

    if (javaSources.length > 0) {
      params.push(`-Dsonar.sources=${javaSources.join(',')}`);
      console.error(`Detected Java sources: ${javaSources.join(', ')}`);
    } else {
      params.push(`-Dsonar.sources=${projectPath}`);
      console.error('Using project root as Java source');
    }

    if (javaTests.length > 0) {
      params.push(`-Dsonar.tests=${javaTests.join(',')}`);
      console.error(`Detected Java tests: ${javaTests.join(', ')}`);
    }

    params.push('-Dsonar.java.source=8'); // Default Java version
  }

  /**
   * Helper to add directory parameter if it exists
   */
  private async addDirectoryIfExists(
    params: string[],
    projectPath: string,
    relativeDir: string,
    sonarParam: string,
    description: string
  ): Promise<void> {
    const dirPath = path.join(projectPath, relativeDir);
    try {
      await fs.access(dirPath);
      params.push(sonarParam);
      console.error(`${description} found: ${relativeDir}`);
    } catch {
      console.error(`${description} not found: ${relativeDir}`);
    }
  }


  /**
   * Add Java version parameter based on build tool configuration
   * This method provides more accurate version detection than runtime java -version
   */
  private async addJavaVersionParameter(params: string[], projectPath: string, buildTool?: string): Promise<void> {
    let version: string | null = null;

    // Try to detect version from build configuration
    if (buildTool === 'maven') {
      version = await this.detectJavaVersionFromPom(projectPath);
    } else if (buildTool === 'gradle') {
      version = await this.detectJavaVersionFromGradle(projectPath);
    }

    // If detected, add parameter
    if (version) {
      params.push(`-Dsonar.java.source=${version}`);
      console.error(`✅ Detected Java version: ${version}`);
    }
  }

  /**
   * Detect Java version from pom.xml
   * Looks for maven.compiler.source or maven.compiler.target properties
   */
  private async detectJavaVersionFromPom(projectPath: string): Promise<string | null> {
    try {
      const pomPath = path.join(projectPath, 'pom.xml');
      const pomContent = await fs.readFile(pomPath, 'utf-8');

      // Look for maven.compiler.source
      const sourceMatch = /<maven\.compiler\.source>(\d+(?:\.\d+)?)<\/maven\.compiler\.source>/.exec(pomContent);
      if (sourceMatch) {
        return sourceMatch[1];
      }

      // Look for maven.compiler.target as fallback
      const targetMatch = /<maven\.compiler\.target>(\d+(?:\.\d+)?)<\/maven\.compiler\.target>/.exec(pomContent);
      if (targetMatch) {
        return targetMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Detect Java version from build.gradle or build.gradle.kts
   * Looks for sourceCompatibility or targetCompatibility
   */
  private async detectJavaVersionFromGradle(projectPath: string): Promise<string | null> {
    try {
      // Try build.gradle first
      let gradlePath = path.join(projectPath, 'build.gradle');
      let gradleContent: string;

      try {
        gradleContent = await fs.readFile(gradlePath, 'utf-8');
      } catch {
        // Try build.gradle.kts (Kotlin DSL)
        gradlePath = path.join(projectPath, 'build.gradle.kts');
        gradleContent = await fs.readFile(gradlePath, 'utf-8');
      }

      // Look for sourceCompatibility
      const sourceMatch = /sourceCompatibility\s*=\s*['"']?(\d+(?:\.\d+)?)['"']?/.exec(gradleContent);
      if (sourceMatch) {
        return sourceMatch[1];
      }

      // Look for targetCompatibility as fallback
      const targetMatch = /targetCompatibility\s*=\s*['"']?(\d+(?:\.\d+)?)['"']?/.exec(gradleContent);
      if (targetMatch) {
        return targetMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Check if Java project is compiled and provide helpful error if not
   */
  private async checkJavaCompilation(projectPath: string): Promise<void> {
    if (!this.projectContext || !this.projectContext.language.includes('java')) {
      return; // Not a Java project, skip check
    }

    // Skip check if sonar-project.properties exists (user has custom config)
    const propsFile = path.join(projectPath, 'sonar-project.properties');
    if (await this.fileExists(propsFile)) {
      console.error('📄 sonar-project.properties found, skipping compilation check');
      return;
    }

    const buildTool = this.projectContext.buildTool;
    let compileCommand: string;
    let possibleBinaryDirs: string[];

    // Determine possible compiled classes directories (including multi-module)
    if (buildTool === 'maven') {
      possibleBinaryDirs = [
        path.join(projectPath, 'target', 'classes'),
        // Multi-module: look for any module with target/classes
      ];
      compileCommand = 'mvn compile -q';
    } else if (buildTool === 'gradle') {
      possibleBinaryDirs = [
        path.join(projectPath, 'build', 'classes', 'java', 'main'),
        path.join(projectPath, 'build', 'classes', 'kotlin', 'main'),
        // Multi-module: look for any module with build/classes
      ];
      compileCommand = './gradlew compileJava';
    } else {
      // Unknown build tool, skip check
      return;
    }

    // Check standard locations first
    for (const dir of possibleBinaryDirs) {
      if (await this.fileExists(dir)) {
        return; // Found compiled classes
      }
    }

    // For multi-module projects, search for any compiled classes in subdirectories
    const hasCompiledClasses = await this.findCompiledClassesRecursive(projectPath, buildTool);
    if (hasCompiledClasses) {
      console.error('📦 Found compiled classes in multi-module structure');
      return;
    }

    // No compiled classes found - throw error
    const expectedDir = possibleBinaryDirs[0];
    throw new Error(
      `❌ Java project not compiled\n\n` +
      `SonarQube requires compiled classes to analyze Java projects.\n\n` +
      `📝 Please compile your project first:\n` +
      `   ${compileCommand}\n\n` +
      `💡 This ensures SonarQube can:\n` +
      `   - Analyze bytecode for deeper insights\n` +
      `   - Detect runtime issues and dependencies\n` +
      `   - Provide accurate code coverage metrics\n\n` +
      `Expected directory: ${expectedDir}\n\n` +
      `💡 For multi-module projects, you can also use sonar_generate_config\n` +
      `   to create a custom configuration with correct binary paths.\n\n` +
      `After compiling, run the scan again.`
    );
  }

  /**
   * Recursively search for compiled classes in multi-module projects
   */
  private async findCompiledClassesRecursive(projectPath: string, buildTool?: string): Promise<boolean> {
    const maxDepth = 3;

    const searchDir = async (dir: string, depth: number): Promise<boolean> => {
      if (depth > maxDepth) return false;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (!entry.isDirectory()) continue;

          const fullPath = path.join(dir, entry.name);

          // Skip common non-module directories
          if (['node_modules', '.git', '.idea', '.vscode', 'src'].includes(entry.name)) {
            continue;
          }

          // Check if this directory contains compiled classes
          if (buildTool === 'maven' && entry.name === 'target') {
            const classesDir = path.join(fullPath, 'classes');
            if (await this.fileExists(classesDir)) {
              return true;
            }
          } else if (buildTool === 'gradle' && entry.name === 'build') {
            const classesDir = path.join(fullPath, 'classes', 'java', 'main');
            const kotlinClassesDir = path.join(fullPath, 'classes', 'kotlin', 'main');
            if (await this.fileExists(classesDir) || await this.fileExists(kotlinClassesDir)) {
              return true;
            }
          }

          // Recurse into subdirectories
          if (await searchDir(fullPath, depth + 1)) {
            return true;
          }
        }
      } catch {
        // Ignore permission errors
      }

      return false;
    };

    return searchDir(projectPath, 0);
  }

  /**
   * Detect Java source directories
   */
  private async detectJavaSourceDirs(projectPath: string): Promise<string[]> {
    const commonSourcePaths = [
      'src/main/java',
      'src/java',
      'src',
      'java',
      'source',
      'sources'
    ];
    
    const existingSources: string[] = [];
    
    for (const srcPath of commonSourcePaths) {
      try {
        const fullPath = path.join(projectPath, srcPath);
        await fs.access(fullPath);
        // Check if it contains .java files
        if (await this.containsJavaFiles(fullPath)) {
          existingSources.push(srcPath);
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
    
    return existingSources;
  }

  /**
   * Detect Java test directories
   */
  private async detectJavaTestDirs(projectPath: string): Promise<string[]> {
    const commonTestPaths = [
      'src/test/java',
      'test/java',
      'tests/java',
      'src/tests/java',
      'test',
      'tests'
    ];
    
    const existingTests: string[] = [];
    
    for (const testPath of commonTestPaths) {
      try {
        const fullPath = path.join(projectPath, testPath);
        await fs.access(fullPath);
        // Check if it contains .java files
        if (await this.containsJavaFiles(fullPath)) {
          existingTests.push(testPath);
        }
      } catch {
        // Directory doesn't exist, skip
      }
    }
    
    return existingTests;
  }

  /**
   * Check if directory contains Java files
   */
  private async containsJavaFiles(dirPath: string): Promise<boolean> {
    try {
      // Recursively search for .java files without using shell
      const hasJavaFile = async (dir: string): Promise<boolean> => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (await hasJavaFile(fullPath)) return true;
            } else if (entry.isFile() && entry.name.endsWith('.java')) {
              return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      };
      return await hasJavaFile(dirPath);
    } catch {
      return false;
    }
  }

  /**
   * Add JavaScript/TypeScript-specific parameters
   */
  private async addJavaScriptParameters(params: string[], projectPath: string): Promise<void> {
    console.error('🔍 Configuring JavaScript/TypeScript project...');

    // Check if TypeScript is used
    const hasTsConfig = await this.detectTsConfig(projectPath);
    if (hasTsConfig) {
      console.error('✅ Found tsconfig.json - TypeScript project detected');
      params.push('-Dsonar.typescript.tsconfigPath=tsconfig.json');
    }

    // Determine source directory (prefer src if it exists)
    const srcPath = path.join(projectPath, 'src');
    let sourcesDir = '.';
    try {
      await fs.access(srcPath);
      sourcesDir = 'src';
      console.error('✅ Using src directory as source root');
    } catch {
      console.error('ℹ️  Using project root as source directory');
    }
    params.push(`-Dsonar.sources=${sourcesDir}`);

    // Exclusions - common directories to exclude
    const exclusions = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/*.bundle.js'
    ];
    params.push(`-Dsonar.exclusions=${exclusions.join(',')}`);

    // Test file patterns
    const testInclusions = [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/*.test.js',
      '**/*.test.jsx',
      '**/*.spec.js',
      '**/*.spec.jsx'
    ];
    params.push(`-Dsonar.test.inclusions=${testInclusions.join(',')}`);

    // Configure file suffixes
    params.push('-Dsonar.javascript.file.suffixes=.js,.jsx');
    params.push('-Dsonar.typescript.file.suffixes=.ts,.tsx');

    console.error('✅ JavaScript/TypeScript project configured successfully');
  }

  /**
   * Add Python-specific parameters
   */
  private async addPythonParameters(params: string[], projectPath: string): Promise<void> {
    // Python source directories - check common patterns
    // Must contain actual Python files, not just exist
    // Note: '.' is checked last and only used if no specific dirs found
    const specificDirs = ['src', 'app', 'lib'];
    const dirsWithPython: string[] = [];

    for (const dir of specificDirs) {
      const fullPath = path.join(projectPath, dir);
      if (await this.directoryContainsPythonFiles(fullPath)) {
        dirsWithPython.push(dir);
      }
    }

    if (dirsWithPython.length > 0) {
      // Use specific directories that contain Python files
      params.push(`-Dsonar.sources=${dirsWithPython.join(',')}`);
      console.error(`✅ Python sources found in: ${dirsWithPython.join(', ')}`);
    } else if (await this.directoryContainsPythonFiles(projectPath)) {
      // Fallback to project root only if it has Python files and no specific dirs
      params.push(`-Dsonar.sources=.`);
      console.error('✅ Python sources found in project root');
    } else {
      // Last resort
      params.push(`-Dsonar.sources=.`);
      console.error('⚠️ No Python source directories found, using project root');
    }

    // Check if test directory exists
    let testDir: string | null = null;
    const testDirs = ['test', 'tests'];
    for (const dir of testDirs) {
      try {
        await fs.access(path.join(projectPath, dir));
        testDir = dir;
        break;
      } catch {
        // Directory doesn't exist
      }
    }

    // Python exclusions - IMPORTANT: Do NOT exclude test files if we have a test directory
    // SonarQube doesn't allow files to be both in exclusions and in sonar.tests
    const exclusions = [
      '**/__pycache__/**',
      '**/venv/**',
      '**/env/**',
      '**/.venv/**',
      '**/site-packages/**'
    ];

    // Only exclude test files from sources if there's NO separate test directory
    // If there IS a test directory, use sonar.tests instead (which properly separates test code)
    if (!testDir) {
      exclusions.push('**/test_*.py');
      exclusions.push('**/*_test.py');
      console.error('ℹ️  No test directory found - excluding test files from sources');
    }

    params.push(`-Dsonar.exclusions=${exclusions.join(',')}`);

    // Add test directory if found
    if (testDir) {
      params.push(`-Dsonar.tests=${testDir}`);
      // Also add test file patterns for proper test identification
      params.push('-Dsonar.test.inclusions=**/test_*.py,**/*_test.py');
      console.error(`✅ Found test directory: ${testDir}`);
    }

    // Add Python version detection (CRITICAL for accurate analysis)
    await this.addPythonVersionParameter(params, projectPath);
  }

  /**
   * Add Python version parameter
   * Critical for avoiding false positives on version-specific features
   */
  private async addPythonVersionParameter(params: string[], projectPath: string): Promise<void> {
    const versions = await this.detectPythonVersion(projectPath);

    if (versions && versions.length > 0) {
      params.push(`-Dsonar.python.version=${versions.join(',')}`);
      console.error(`✅ Detected Python versions: ${versions.join(', ')}`);
    }
  }

  /**
   * Detect Python version from various sources
   * Priority: pyproject.toml > .python-version > runtime.txt
   */
  private async detectPythonVersion(projectPath: string): Promise<string[] | null> {
    // Try pyproject.toml first (most accurate - can specify multiple versions)
    const pyprojectVersions = await this.detectPythonVersionFromPyproject(projectPath);
    if (pyprojectVersions) {
      return pyprojectVersions;
    }

    // Fallback to .python-version (single version)
    const pythonVersionFile = await this.detectPythonVersionFromPythonVersion(projectPath);
    if (pythonVersionFile) {
      return [pythonVersionFile];
    }

    // Could add runtime.txt for Heroku projects here

    return null;
  }

  /**
   * Detect Python versions from pyproject.toml requires-python
   * Examples: ">=3.8" -> [3.8], ">=3.8,<3.12" -> [3.8, 3.9, 3.10, 3.11]
   */
  private async detectPythonVersionFromPyproject(projectPath: string): Promise<string[] | null> {
    try {
      const pyprojectPath = path.join(projectPath, 'pyproject.toml');
      const content = await fs.readFile(pyprojectPath, 'utf-8');

      // Look for requires-python in [project] or [tool.poetry.dependencies]
      const requiresPythonMatch = /requires-python\s*=\s*["']([^"']+)["']/.exec(content);
      if (!requiresPythonMatch) {
        return null;
      }

      const requiresPython = requiresPythonMatch[1];

      // Parse version constraints
      // Examples: ">=3.8", ">=3.8,<3.12", "^3.8", "~=3.8"
      const minVersionMatch = />=?(\d+)\.(\d+)/.exec(requiresPython);
      const maxVersionMatch = /<(\d+)\.(\d+)/.exec(requiresPython);

      if (!minVersionMatch) {
        return null;
      }

      const minMajor = parseInt(minVersionMatch[1]);
      const minMinor = parseInt(minVersionMatch[2]);

      let maxMajor = minMajor;
      let maxMinor = minMinor + 1; // Default: one minor version up

      if (maxVersionMatch) {
        maxMajor = parseInt(maxVersionMatch[1]);
        maxMinor = parseInt(maxVersionMatch[2]);
      }

      // Generate list of versions (e.g., 3.8, 3.9, 3.10, 3.11)
      const versions: string[] = [];

      for (let major = minMajor; major <= maxMajor; major++) {
        const startMinor = (major === minMajor) ? minMinor : 0;
        const endMinor = (major === maxMajor) ? maxMinor : 100;

        for (let minor = startMinor; minor < endMinor; minor++) {
          if (major >= 3) { // Only Python 3+
            versions.push(`${major}.${minor}`);
          }
        }
      }

      return versions.length > 0 ? versions : null;
    } catch {
      return null;
    }
  }

  /**
   * Detect Python version from .python-version file
   * Used by pyenv and other Python version managers
   */
  private async detectPythonVersionFromPythonVersion(projectPath: string): Promise<string | null> {
    try {
      const pythonVersionPath = path.join(projectPath, '.python-version');
      const content = await fs.readFile(pythonVersionPath, 'utf-8');

      // Extract version (e.g., "3.9.18" -> "3.9")
      const versionMatch = /^(\d+\.\d+)/.exec(content.trim());
      if (versionMatch) {
        return versionMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Add Go-specific parameters
   * Go projects are simpler - they analyze source code directly without compilation
   */
  private async addGoParameters(params: string[], projectPath: string): Promise<void> {
    // Check for go.mod (important for accurate analysis)
    const goModPath = path.join(projectPath, 'go.mod');

    try {
      await fs.access(goModPath);
      console.error('✅ Found go.mod - Go module detected');
    } catch {
      console.warn('⚠️  go.mod not found - analysis may be less accurate');
      console.warn('   Consider initializing a Go module with: go mod init');
    }

    // Source configuration
    // Go convention: analyze current directory
    params.push('-Dsonar.sources=.');

    // Exclude test files from sources and vendor directory
    const exclusions = [
      '**/*_test.go',  // Test files
      '**/vendor/**'   // Vendor dependencies (excluded by default but explicit is better)
    ];
    params.push(`-Dsonar.exclusions=${exclusions.join(',')}`);

    // Test configuration
    params.push('-Dsonar.tests=.');
    params.push('-Dsonar.test.inclusions=**/*_test.go');

    // Check for coverage report (optional)
    const coveragePath = path.join(projectPath, 'coverage.out');
    try {
      await fs.access(coveragePath);
      params.push('-Dsonar.go.coverage.reportPaths=coverage.out');
      console.error('✅ Found coverage.out - test coverage will be included');
    } catch {
      // Coverage is optional - don't log warning
    }

    console.error('✅ Go project configured successfully');
  }

  /**
   * Detect if TypeScript configuration exists
   */
  private async detectTsConfig(projectPath: string): Promise<boolean> {
    try {
      const tsConfigPath = path.join(projectPath, 'tsconfig.json');
      await fs.access(tsConfigPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect if compile_commands.json exists (for C/C++ projects)
   */
  private async detectCompileCommands(projectPath: string): Promise<boolean> {
    try {
      const compileCommandsPath = path.join(projectPath, 'compile_commands.json');
      await fs.access(compileCommandsPath);
      return true;
    } catch {
      // Also check in build directory
      try {
        const buildCompileCommandsPath = path.join(projectPath, 'build', 'compile_commands.json');
        await fs.access(buildCompileCommandsPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Add C/C++-specific parameters
   */
  private async addCCppParameters(params: string[], projectPath: string): Promise<void> {
    console.error('🔍 Configuring C/C++ project...');

    // Check for compile_commands.json (important for accurate analysis)
    const hasCompileCommands = await this.detectCompileCommands(projectPath);
    if (hasCompileCommands) {
      // Check if it's in root or build directory
      const rootPath = path.join(projectPath, 'compile_commands.json');
      try {
        await fs.access(rootPath);
        params.push('-Dsonar.cfamily.compile-commands=compile_commands.json');
        console.error('✅ Found compile_commands.json - enabling precise analysis');
      } catch {
        params.push('-Dsonar.cfamily.compile-commands=build/compile_commands.json');
        console.error('✅ Found build/compile_commands.json - enabling precise analysis');
      }
    } else {
      console.warn('⚠️  compile_commands.json not found - analysis may be less accurate');
      console.warn('   For CMake projects: cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON');
      console.warn('   For other projects: use Bear (bear -- make)');
    }

    // Determine source directories
    const sourceDirs: string[] = [];
    const potentialSourceDirs = ['src', 'source', 'include', 'inc'];

    for (const dir of potentialSourceDirs) {
      try {
        const dirPath = path.join(projectPath, dir);
        await fs.access(dirPath);
        sourceDirs.push(dir);
      } catch {
        // Directory doesn't exist
      }
    }

    if (sourceDirs.length > 0) {
      params.push(`-Dsonar.sources=${sourceDirs.join(',')}`);
      console.error(`✅ Using source directories: ${sourceDirs.join(', ')}`);
    } else {
      params.push('-Dsonar.sources=.');
      console.error('ℹ️  Using project root as source directory');
    }

    // Exclusions - common directories to exclude
    const exclusions = [
      '**/build/**',
      '**/Build/**',
      '**/cmake-build-*/**',
      '**/third_party/**',
      '**/thirdparty/**',
      '**/vendor/**',
      '**/external/**',
      '**/.git/**',
      '**/node_modules/**'
    ];
    params.push(`-Dsonar.exclusions=${exclusions.join(',')}`);

    // Configure file suffixes for C and C++
    // C file suffixes
    params.push('-Dsonar.c.file.suffixes=.c,.h');

    // C++ file suffixes (more comprehensive list)
    params.push('-Dsonar.cpp.file.suffixes=.cpp,.hpp,.cc,.cxx,.c++,.hh,.hxx,.h++');

    console.error('✅ C/C++ project configured successfully');
  }

  /**
   * Add Maven libraries (dependencies) to scanner parameters
   * Uses Maven's dependency:build-classpath to get all runtime dependencies
   */
  private async addMavenLibraries(params: string[], projectPath: string): Promise<void> {
    try {
      console.error('🔍 Resolving Maven dependencies...');

      // Use Maven to get the full classpath with all dependencies
      // Note: Do NOT use -q flag as it suppresses classpath output
      const { stdout } = await execAsync(
        'mvn dependency:build-classpath -DincludeScope=compile',
        {
          cwd: projectPath,
          timeout: 60000, // 1 minute timeout
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        }
      );

      // Parse the classpath output
      // Maven outputs the classpath mixed with [INFO] lines and download progress
      // We need to filter out Maven's logging and extract only the classpath
      //
      // IMPORTANT: When dependencies are downloaded for the first time, Maven outputs
      // progress messages like "Downloading from central: ...", "Downloaded from central: ...",
      // "Progress (1),...", etc. These must be filtered out or they corrupt the classpath.
      const lines = stdout.split('\n');
      const classpathLines = lines.filter(line => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return false;

        // Filter out Maven log lines
        if (trimmed.includes('[INFO]')) return false;
        if (trimmed.includes('[WARNING]')) return false;
        if (trimmed.includes('[ERROR]')) return false;

        // Filter out Maven download progress messages (critical for first-time dependency downloads)
        if (trimmed.startsWith('Downloading from ')) return false;
        if (trimmed.startsWith('Downloaded from ')) return false;
        if (trimmed.startsWith('Progress ')) return false;
        if (trimmed.includes('Downloading from ')) return false;
        if (trimmed.includes('Downloaded from ')) return false;

        // Filter out lines with URL patterns (http://, https://, repo.maven.apache.org)
        if (trimmed.includes('://')) return false;
        if (trimmed.includes('repo.maven.apache.org')) return false;
        if (trimmed.includes('central:')) return false;

        // Filter out lines with download speed/progress indicators
        if (/\d+\s*(kB|MB|B)\s*(at|\/s)/i.test(trimmed)) return false;
        if (/\(\d+\s*(kB|MB|B)\s*(at|\/s)/i.test(trimmed)) return false;

        // Classpath must contain valid file paths with /
        if (!trimmed.includes('/')) return false;

        // Valid classpath lines should start with a path (absolute path starting with /)
        // or be a continuation of paths separated by : (Unix) or ; (Windows)
        // Check that the line looks like valid file paths
        const pathParts = trimmed.split(/[:;]/);
        const hasValidPaths = pathParts.some(part => {
          const p = part.trim();
          // Valid path should start with / (Unix) or drive letter (Windows)
          // and should end with .jar or be a directory
          return (p.startsWith('/') || /^[A-Za-z]:/.test(p)) &&
                 (p.endsWith('.jar') || p.includes('.m2/repository') || p.includes('target/'));
        });

        return hasValidPaths;
      });

      if (classpathLines.length === 0) {
        console.error('⚠️  No Maven dependencies found in classpath output');
        console.error(`   Maven stdout had ${lines.length} lines, none matched classpath pattern`);
        return;
      }

      // Join all classpath lines and split by path separator (: on Unix, ; on Windows)
      const separator = path.delimiter; // Platform-specific
      const classpath = classpathLines.join('');
      const libraryPaths = classpath
        .split(separator)
        .filter(p => p.trim().length > 0 && p.includes('.jar'));

      if (libraryPaths.length === 0) {
        console.error('⚠️  No Maven libraries found after parsing classpath');
        return;
      }

      // Join all libraries with comma (SonarQube format)
      const libraries = libraryPaths.join(',');
      params.push(`-Dsonar.java.libraries=${libraries}`);

      console.error(`✅ Added ${libraryPaths.length} Maven libraries to SonarQube analysis`);
      console.error(`   Example libraries: ${libraryPaths.slice(0, 3).join(', ')}${libraryPaths.length > 3 ? '...' : ''}`);
    } catch (error: any) {
      // Don't fail the entire analysis if we can't get dependencies
      console.error(`⚠️  Could not resolve Maven dependencies: ${error.message}`);
      console.error('   Analysis will continue without library classpath');
      console.error('   This may result in less accurate analysis results');

      // Check for common issues
      if (error.message.includes('mvn: not found') || error.message.includes('command not found')) {
        console.error('   💡 Tip: Ensure Maven is installed and in PATH');
      } else if (error.message.includes('timeout')) {
        console.error('   💡 Tip: Dependency resolution took too long - consider running "mvn dependency:resolve" first');
      } else if (error.message.includes('pom.xml')) {
        console.error('   💡 Tip: Ensure pom.xml is valid and all dependencies are available');
      }
    }
  }

  /**
   * Add Gradle libraries (dependencies) to scanner parameters
   * Uses Gradle's dependencies task to get all runtime dependencies
   */
  private async addGradleLibraries(params: string[], projectPath: string): Promise<void> {
    try {
      console.error('🔍 Resolving Gradle dependencies...');

      // Determine Gradle wrapper or command
      const gradleCmd = await this.getGradleCommand(projectPath);

      // Use a custom Gradle task to print classpath
      // We'll create a temporary task that prints the runtime classpath
      const { stderr } = await execAsync(
        `${gradleCmd} dependencies --configuration compileClasspath -q`,
        {
          cwd: projectPath,
          timeout: 60000, // 1 minute timeout
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        }
      );

      if (stderr && stderr.length > 0) {
        console.error(`Gradle dependency resolution warnings: ${stderr.substring(0, 500)}`);
      }

      // Parse Gradle dependencies output to find JAR files
      // This is a best-effort approach - we'll look for .jar references
      const jarFiles = await this.findGradleDependencyJars(projectPath);

      if (jarFiles.length === 0) {
        console.error('⚠️  No Gradle libraries found');
        return;
      }

      // Join all libraries with comma (SonarQube format)
      const libraries = jarFiles.join(',');
      params.push(`-Dsonar.java.libraries=${libraries}`);

      console.error(`✅ Added ${jarFiles.length} Gradle libraries to SonarQube analysis`);
      console.error(`   Example libraries: ${jarFiles.slice(0, 3).join(', ')}${jarFiles.length > 3 ? '...' : ''}`);
    } catch (error: any) {
      // Don't fail the entire analysis if we can't get dependencies
      console.error(`⚠️  Could not resolve Gradle dependencies: ${error.message}`);
      console.error('   Analysis will continue without library classpath');
      console.error('   This may result in less accurate analysis results');

      // Check for common issues
      if (error.message.includes('gradle: not found') || error.message.includes('command not found')) {
        console.error('   💡 Tip: Ensure Gradle wrapper (gradlew) exists or Gradle is installed');
      } else if (error.message.includes('timeout')) {
        console.error('   💡 Tip: Dependency resolution took too long - consider running "gradle dependencies" first');
      }
    }
  }

  /**
   * Get the appropriate Gradle command (wrapper or system gradle)
   */
  private async getGradleCommand(projectPath: string): Promise<string> {
    // Check for Gradle wrapper (preferred)
    const wrapperUnix = path.join(projectPath, 'gradlew');
    const wrapperWindows = path.join(projectPath, 'gradlew.bat');

    try {
      await fs.access(wrapperUnix, fs.constants.X_OK);
      return './gradlew';
    } catch {
      // Try Windows wrapper
      try {
        await fs.access(wrapperWindows);
        return 'gradlew.bat';
      } catch {
        // Fall back to system gradle
        return 'gradle';
      }
    }
  }

  /**
   * Find Gradle dependency JARs from the cache
   * This looks in the Gradle cache directory for resolved dependencies
   */
  private async findGradleDependencyJars(projectPath: string): Promise<string[]> {
    const jarFiles: string[] = [];

    try {
      // Common Gradle cache locations
      const userHome = process.env.HOME || process.env.USERPROFILE || '';
      const gradleCachePath = path.join(userHome, '.gradle', 'caches', 'modules-2', 'files-2.1');

      // Try to read build.gradle or build.gradle.kts to understand dependencies
      // For now, we'll scan the cache directory for recent JARs
      // This is a simplified approach - a full implementation would parse build files

      try {
        await fs.access(gradleCachePath);
        // Recursively find all .jar files in cache (limited depth to avoid performance issues)
        const jars = await this.findJarFilesInDirectory(gradleCachePath, 3);
        jarFiles.push(...jars);
      } catch {
        console.error('   ℹ️  Gradle cache not accessible, trying alternative approach');
      }

    } catch (error: any) {
      console.error(`   Could not scan Gradle cache: ${error.message}`);
    }

    return jarFiles;
  }

  /**
   * Recursively find JAR files in a directory (with depth limit)
   */
  private async findJarFilesInDirectory(dir: string, maxDepth: number): Promise<string[]> {
    if (maxDepth <= 0) return [];

    const jarFiles: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries.slice(0, 100)) { // Limit entries per directory
        const fullPath = path.join(dir, entry.name);

        if (entry.isFile() && entry.name.endsWith('.jar')) {
          jarFiles.push(fullPath);
        } else if (entry.isDirectory() && maxDepth > 1) {
          const subJars = await this.findJarFilesInDirectory(fullPath, maxDepth - 1);
          jarFiles.push(...subJars);

          // Limit total JARs to avoid performance issues
          if (jarFiles.length > 500) break;
        }
      }
    } catch (error) {
      // Ignore errors for individual directories
    }

    return jarFiles;
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
      
      // If we have a stable issue count (not changing), cache is likely refreshed
      if (previousIssueCount >= 0 && currentCount === previousIssueCount) {
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