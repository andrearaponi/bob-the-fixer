import axios, { AxiosInstance } from 'axios';
import { ProjectContext } from './project-manager.js';

export interface SonarProjectInfo {
  key: string;
  name: string;
  qualifier: string;
  visibility: string;
}

export interface SonarTokenInfo {
  name: string;
  token: string;
  type: string;
  createdAt: string;
  expirationDate?: string;
}

export interface QualityGateTemplate {
  name: string;
  conditions: Array<{
    metric: string;
    op: string;
    error: string;
  }>;
}

export class SonarAdmin {
  public readonly client: AxiosInstance;  // Make public for advanced operations

  constructor(
    private readonly sonarUrl: string,
    private readonly adminToken?: string
  ) {
    // Use admin token from environment if not provided
    const token = adminToken ?? process.env.SONAR_TOKEN ?? process.env.SONAR_ADMIN_TOKEN;
    
    this.client = axios.create({
      baseURL: sonarUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
  }

  /**
   * Check if SonarQube server is accessible and token is valid
   */
  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/authentication/validate');
      return response.data.valid === true;
    } catch (error) {
      console.error('SonarQube connection validation failed:', error);
      return false;
    }
  }

  /**
   * Check if project exists
   */
  async projectExists(projectKey: string): Promise<boolean> {
    try {
      const response = await this.client.get('/api/projects/search', {
        params: { projects: projectKey }
      });
      return response.data.components && response.data.components.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Create new SonarQube project
   */
  async createProject(projectKey: string, projectName: string, visibility: 'public' | 'private' = 'private'): Promise<SonarProjectInfo> {
    try {
      const params = new URLSearchParams();
      params.append('project', projectKey);
      params.append('name', projectName);
      params.append('visibility', visibility);

      const response = await this.client.post('/api/projects/create', params);
      
      return {
        key: response.data.project.key,
        name: response.data.project.name,
        qualifier: response.data.project.qualifier,
        visibility: response.data.project.visibility
      };
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data?.errors) {
        const errorMsg = error.response.data.errors.map((e: any) => e.msg).join(', ');
        throw new Error(`Failed to create project: ${errorMsg}`);
      }
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  /**
   * Generate user token for project
   */
  async generateToken(tokenName: string, projectKey?: string, type: 'USER_TOKEN' | 'PROJECT_ANALYSIS_TOKEN' = 'USER_TOKEN'): Promise<SonarTokenInfo> {
    try {
      const params = new URLSearchParams();
      params.append('name', tokenName);
      params.append('type', type);
      
      if (projectKey && type === 'PROJECT_ANALYSIS_TOKEN') {
        params.append('projectKey', projectKey);
      }

      const response = await this.client.post('/api/user_tokens/generate', params);
      
      return {
        name: response.data.name,
        token: response.data.token,
        type: response.data.type,
        createdAt: response.data.createdAt,
        expirationDate: response.data.expirationDate
      };
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data?.errors) {
        const errorMsg = error.response.data.errors.map((e: any) => e.msg).join(', ');
        throw new Error(`Failed to generate token: ${errorMsg}`);
      }
      throw new Error(`Failed to generate token: ${error.message}`);
    }
  }

  /**
   * List existing tokens (for cleanup)
   */
  async listTokens(): Promise<SonarTokenInfo[]> {
    try {
      const response = await this.client.get('/api/user_tokens/search');
      return response.data.userTokens.map((token: any) => ({
        name: token.name,
        token: '***', // Token value is not returned by search API
        type: token.type,
        createdAt: token.createdAt,
        expirationDate: token.expirationDate
      }));
    } catch (error) {
      console.error('Failed to list tokens:', error);
      return [];
    }
  }

  /**
   * Revoke token
   */
  async revokeToken(tokenName: string): Promise<boolean> {
    try {
      const params = new URLSearchParams();
      params.append('name', tokenName);
      
      await this.client.post('/api/user_tokens/revoke', params);
      return true;
    } catch (error) {
      console.error(`Failed to revoke token ${tokenName}:`, error);
      return false;
    }
  }

  /**
   * Delete project
   */
  async deleteProject(projectKey: string): Promise<boolean> {
    try {
      const params = new URLSearchParams();
      params.append('project', projectKey);
      
      await this.client.post('/api/projects/delete', params);
      return true;
    } catch (error) {
      console.error(`Failed to delete project ${projectKey}:`, error);
      return false;
    }
  }

  /**
   * Get quality gate templates based on project context
   */
  getQualityGateTemplate(context: ProjectContext): QualityGateTemplate {
    const primaryLanguage = context.language[0] || 'generic';
    
    const templates: Record<string, QualityGateTemplate> = {
      javascript: {
        name: 'JavaScript Quality Gate',
        conditions: [
          { metric: 'new_coverage', op: 'LT', error: '70' },
          { metric: 'new_duplicated_lines_density', op: 'GT', error: '3' },
          { metric: 'new_maintainability_rating', op: 'GT', error: '1' },
          { metric: 'new_reliability_rating', op: 'GT', error: '1' },
          { metric: 'new_security_rating', op: 'GT', error: '1' }
        ]
      },
      typescript: {
        name: 'TypeScript Quality Gate',
        conditions: [
          { metric: 'new_coverage', op: 'LT', error: '80' },
          { metric: 'new_duplicated_lines_density', op: 'GT', error: '2' },
          { metric: 'new_maintainability_rating', op: 'GT', error: '1' },
          { metric: 'new_reliability_rating', op: 'GT', error: '1' },
          { metric: 'new_security_rating', op: 'GT', error: '1' }
        ]
      },
      java: {
        name: 'Java Quality Gate',
        conditions: [
          { metric: 'new_coverage', op: 'LT', error: '85' },
          { metric: 'new_duplicated_lines_density', op: 'GT', error: '2' },
          { metric: 'new_maintainability_rating', op: 'GT', error: '1' },
          { metric: 'new_reliability_rating', op: 'GT', error: '1' },
          { metric: 'new_security_rating', op: 'GT', error: '1' },
          { metric: 'new_security_hotspots_reviewed', op: 'LT', error: '100' }
        ]
      },
      python: {
        name: 'Python Quality Gate',
        conditions: [
          { metric: 'new_coverage', op: 'LT', error: '75' },
          { metric: 'new_duplicated_lines_density', op: 'GT', error: '3' },
          { metric: 'new_maintainability_rating', op: 'GT', error: '1' },
          { metric: 'new_reliability_rating', op: 'GT', error: '1' },
          { metric: 'new_security_rating', op: 'GT', error: '1' }
        ]
      },
      go: {
        name: 'Go Quality Gate',
        conditions: [
          { metric: 'new_coverage', op: 'LT', error: '80' },
          { metric: 'new_duplicated_lines_density', op: 'GT', error: '2' },
          { metric: 'new_maintainability_rating', op: 'GT', error: '1' },
          { metric: 'new_reliability_rating', op: 'GT', error: '1' },
          { metric: 'new_security_rating', op: 'GT', error: '1' }
        ]
      },
      generic: {
        name: 'Generic Quality Gate',
        conditions: [
          { metric: 'new_coverage', op: 'LT', error: '70' },
          { metric: 'new_duplicated_lines_density', op: 'GT', error: '3' },
          { metric: 'new_maintainability_rating', op: 'GT', error: '1' },
          { metric: 'new_reliability_rating', op: 'GT', error: '1' },
          { metric: 'new_security_rating', op: 'GT', error: '1' }
        ]
      }
    };

    return templates[primaryLanguage] || templates.generic;
  }

  /**
   * Apply quality gate to project
   */
  async applyQualityGate(projectKey: string, template: QualityGateTemplate): Promise<boolean> {
    try {
      // For now, just use the default quality gate
      // In a full implementation, we would create a custom quality gate
      // and apply the specific conditions
      
      console.error(`Would apply quality gate template "${template.name}" to project ${projectKey}`);
      console.error('Conditions:', template.conditions);
      
      // TODO: Implement custom quality gate creation and application
      // This requires additional SonarQube API calls to:
      // 1. Create quality gate: POST /api/qualitygates/create
      // 2. Add conditions: POST /api/qualitygates/create_condition  
      // 3. Apply to project: POST /api/qualitygates/select
      
      return true;
    } catch (error) {
      console.error('Failed to apply quality gate:', error);
      return false;
    }
  }

  /**
   * Setup complete project with token and quality gate
   */
  async setupProject(context: ProjectContext): Promise<{
    project: SonarProjectInfo;
    token: SonarTokenInfo;
    qualityGate: QualityGateTemplate;
  }> {
    const projectKey = this.generateProjectKey(context);
    const tokenName = `bobthefixer-${context.name}-${Date.now()}`;

    // Check if project already exists
    const projectExists = await this.projectExists(projectKey);
    let project: SonarProjectInfo;

    if (projectExists) {
      console.error(`Project ${projectKey} already exists`);
      // Get project info
      const response = await this.client.get('/api/projects/search', {
        params: { projects: projectKey }
      });
      project = response.data.components[0];
    } else {
      console.error(`Creating new project: ${projectKey}`);
      project = await this.createProject(projectKey, context.name);
    }

    // Generate token for this project (USER_TOKEN for full permissions)
    console.error(`Generating USER_TOKEN: ${tokenName}`);
    let token: SonarTokenInfo;
    
    try {
      // Try USER_TOKEN first (full permissions)
      token = await this.generateToken(tokenName, projectKey, 'USER_TOKEN');
      console.error('Successfully generated USER_TOKEN with full permissions');
    } catch (error: any) {
      console.error(`USER_TOKEN generation failed: ${error.message}`);
      console.error('Falling back to PROJECT_ANALYSIS_TOKEN (limited permissions)');
      
      try {
        // Fallback to PROJECT_ANALYSIS_TOKEN if USER_TOKEN fails
        token = await this.generateToken(tokenName, projectKey, 'PROJECT_ANALYSIS_TOKEN');
        console.error('Successfully generated PROJECT_ANALYSIS_TOKEN (may have permission limitations)');
      } catch (fallbackError: any) {
        console.error('Both token generation methods failed');
        throw new Error(
          `Token generation failed: ${error.message}\\n` +
          `Fallback also failed: ${fallbackError.message}\\n\\n` +
          `Check that the admin user has sufficient permissions to generate tokens.`
        );
      }
    }

    // Get and apply quality gate template
    const qualityGate = this.getQualityGateTemplate(context);
    await this.applyQualityGate(projectKey, qualityGate);

    return {
      project,
      token,
      qualityGate
    };
  }

  /**
   * Generate project key based on context
   * Uses SHA-256 for better security than MD5
   */
  private generateProjectKey(context: ProjectContext): string {
    const baseName = context.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const pathHash = require('crypto').createHash('sha256').update(context.path).digest('hex').substring(0, 8);
    return `${baseName}-${pathHash}`;
  }

  /**
   * Cleanup old projects and tokens
   */
  async cleanup(olderThanDays: number = 30): Promise<{
    deletedProjects: string[];
    revokedTokens: string[];
  }> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const deletedProjects: string[] = [];
    const revokedTokens: string[] = [];

    try {
      // Get all tokens
      const tokens = await this.listTokens();
      
      // Revoke old tokens
      for (const token of tokens) {
        if (token.name.startsWith('bobthefixer-') && new Date(token.createdAt) < cutoffDate) {
          const revoked = await this.revokeToken(token.name);
          if (revoked) {
            revokedTokens.push(token.name);
          }
        }
      }

      // TODO: Get and delete old projects
      // This would require additional logic to identify which projects
      // are Bob the Fixer-managed and haven't been used recently

      console.error(`Cleanup completed: ${revokedTokens.length} tokens revoked, ${deletedProjects.length} projects deleted`);
    } catch (error) {
      console.error('Cleanup failed:', error);
    }

    return { deletedProjects, revokedTokens };
  }
}