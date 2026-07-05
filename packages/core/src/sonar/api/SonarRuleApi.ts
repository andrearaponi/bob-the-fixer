/**
 * SonarQube Rule API
 *
 * Reads rule details/search/unique-rules info from a SonarQube instance, with a
 * per-instance TTL cache for rule details. Extracted verbatim from
 * SonarQubeClient: depends only on the Axios client (no project key, token or
 * scanner concerns).
 */

import { AxiosInstance } from 'axios';
import { SonarRuleDetails, SonarRuleSearchFilter, SonarRulesResponse } from '../types';

export class SonarRuleApi {
  private ruleCache: Map<string, { data: SonarRuleDetails; expires: number }> = new Map();
  private readonly RULE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly client: AxiosInstance) {}

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
}
