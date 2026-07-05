/**
 * SonarQube Measure API
 *
 * Reads component details, quality gate, security hotspots, project metrics,
 * duplication, line coverage, coverage gaps and technical debt from a SonarQube
 * instance. Extracted verbatim from SonarQubeClient: depends only on the Axios
 * client and the project key (no token or scanner concerns).
 */

import { AxiosInstance } from 'axios';
import {
  SonarComponentDetails,
  SonarQualityGateStatus,
  SonarSecurityHotspot,
  SonarSecurityHotspotDetails,
  SonarProjectMetrics,
  SonarFilesWithDuplication,
  SonarDuplicationDetails,
  SonarLineCoverage,
  FilesWithCoverageGaps,
  FileWithCoverage,
  CoveragePriority,
  HotspotStatus,
  HotspotResolution,
  HotspotSeverity,
} from '../types';

export class SonarMeasureApi {
  constructor(
    private readonly client: AxiosInstance,
    private readonly projectKey: string
  ) {}

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
