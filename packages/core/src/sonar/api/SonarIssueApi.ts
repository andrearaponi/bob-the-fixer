/**
 * SonarQube Issue API
 *
 * Reads issues from a SonarQube instance (list with pagination, by key, similar
 * fixed issues, test files). Extracted verbatim from SonarQubeClient: depends
 * only on the Axios client and the project key (no token or scanner concerns).
 */

import { AxiosInstance } from 'axios';
import { SonarIssue, IssueFilter } from '../types';

export class SonarIssueApi {
  constructor(
    private readonly client: AxiosInstance,
    private readonly projectKey: string
  ) {}

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
}
