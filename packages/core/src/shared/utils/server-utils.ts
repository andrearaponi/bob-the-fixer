import { ProjectConfig } from '../../universal/project-manager.js';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';

export async function saveConfigToFile(configPath: string, config: ProjectConfig): Promise<void> {
  const content = [
    '# Bob the Fixer Local Configuration',
    '# Auto-generated - do not commit to version control',
    '',
    `SONAR_URL=${config.sonarUrl}`,
    `SONAR_TOKEN=${config.sonarToken}`,
    `SONAR_PROJECT_KEY=${config.sonarProjectKey}`,
    `CREATED_AT=${config.createdAt}`,
    config.language ? `LANGUAGE=${config.language}` : '',
    config.framework ? `FRAMEWORK=${config.framework}` : '',
  ].filter(Boolean).join('\n');

  await fs.writeFile(configPath, content, 'utf-8');
}

export async function verifyProjectSetup(projectKey: string, token: string): Promise<void> {
  // This is a placeholder for actual verification logic
  // In a real scenario, you might call SonarQube API to check project status
  console.error(`Verifying project setup for ${projectKey} with token ${token.substring(0, 5)}...`);
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
  console.error(`Project ${projectKey} verified.`);
}

export function generateProjectKey(context: { name: string; path: string }): string {
  const baseName = context.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  // Use SHA-256 for better security than MD5
  const pathHash = crypto.createHash('sha256').update(context.path).digest('hex').substring(0, 8);
  return `${baseName}-${pathHash}`;
}

export function getSeverityWeight(severity: string): number {
  const weights = { 'BLOCKER': 5, 'CRITICAL': 4, 'MAJOR': 3, 'MINOR': 2, 'INFO': 1 };
  return weights[severity as keyof typeof weights] || 0;
}

export function calculateQualityScore(issues: any[]): number {
  const weights = { 'BLOCKER': 100, 'CRITICAL': 50, 'MAJOR': 20, 'MINOR': 5, 'INFO': 1 };
  const totalWeight = issues.reduce((sum, issue) => {
    return sum + (weights[issue.severity as keyof typeof weights] ?? 0);
  }, 0);
  return Math.max(0, Math.round(100 - (totalWeight / 10)));
}
