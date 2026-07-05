import axios, { AxiosInstance } from 'axios';
import { SonarIssue, IssueFilter, SonarRuleDetails, SonarSecurityHotspot, SonarProjectMetrics, SonarSecurityHotspotDetails, SonarFilesWithDuplication, SonarDuplicationDetails, HotspotStatus, HotspotResolution, HotspotSeverity, SonarRuleSearchFilter, SonarRulesResponse, SonarComponentDetails, SonarQualityGateStatus, SonarLineCoverage, FilesWithCoverageGaps } from './types';
import { ProjectContext } from '../universal/project-manager';
import { sanitizeProjectKey, sanitizeUrl, maskToken } from '../infrastructure/security/input-sanitization.js';
import { ScannerOptions } from './scanner-selection.js';
import { SonarSourceFetcher } from './api/SonarSourceFetcher.js';
import { SonarRuleApi } from './api/SonarRuleApi.js';
import { SonarIssueApi } from './api/SonarIssueApi.js';
import { SonarMeasureApi } from './api/SonarMeasureApi.js';
import { SonarScanRunner } from './api/SonarScanRunner.js';


export class SonarQubeClient {
  public readonly client: AxiosInstance;  // Make public for diagnostic access
  private readonly projectKey: string;
  public readonly projectContext?: ProjectContext;
  private readonly sourceFetcher: SonarSourceFetcher;
  private readonly ruleApi: SonarRuleApi;
  private readonly issueApi: SonarIssueApi;
  private readonly measureApi: SonarMeasureApi;
  private readonly scanRunner: SonarScanRunner;

  /**
   * Rule details cache with TTL
   * Reduces API calls for repeated rule lookups (e.g., during pattern analysis)
   */


  /**
   * Scanner options (e.g., forceCliScanner)
   */

  /**
   * Stores the last scanner parameters built during triggerAnalysis.
   * Used to generate properties file even if scan fails.
   */

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

    this.sourceFetcher = new SonarSourceFetcher(this.client);
    this.ruleApi = new SonarRuleApi(this.client);
    this.issueApi = new SonarIssueApi(this.client, this.projectKey);
    this.measureApi = new SonarMeasureApi(this.client, this.projectKey);
    this.scanRunner = new SonarScanRunner(this.client, this.projectKey, projectContext);

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
    this.scanRunner.setScannerOptions(options);
  }

  async triggerAnalysis(
    projectPath: string,
    detectedProperties?: Map<string, string>
  ): Promise<string[]> {
    return this.scanRunner.triggerAnalysis(projectPath, detectedProperties);
  }

  async triggerDotnetAnalysis(projectPath: string): Promise<void> {
    return this.scanRunner.triggerDotnetAnalysis(projectPath);
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
    return this.scanRunner.waitForAnalysis(timeout, ceTaskId);
  }

  async readCeTaskId(projectPath: string): Promise<string | null> {
    return this.scanRunner.readCeTaskId(projectPath);
  }

  getLastBuiltScannerParams(): string[] {
    return this.scanRunner.getLastBuiltScannerParams();
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
