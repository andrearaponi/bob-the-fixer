/**
 * MCP handler for sonar_link_existing_project
 * Links an existing SonarQube project to the current directory
 */

import { validateInput, SonarLinkExistingProjectSchema } from '../../shared/validators/mcp-schemas.js';
import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl, sanitizePath } from '../../infrastructure/security/input-sanitization.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { ProjectConfig } from '../../universal/project-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger } from '../../shared/logger/structured-logger.js';

/**
 * Handle link existing project MCP tool request
 */
export async function handleLinkExistingProject(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  const logger = getLogger();
  logger.info('Starting link existing project', { args }, correlationId);

  // Validate input
  const validatedArgs = validateInput(
    SonarLinkExistingProjectSchema,
    args,
    'sonar_link_existing_project'
  );

  // Sanitize inputs
  const sonarUrl = sanitizeUrl(validatedArgs.sonarUrl);
  const projectKey = validatedArgs.projectKey;
  const token = validatedArgs.token;
  const projectPath = validatedArgs.projectPath
    ? sanitizePath(validatedArgs.projectPath)
    : process.cwd();

  try {
    // 1. Verify SonarQube connection and project exists
    logger.info('Verifying SonarQube connection and project existence', { sonarUrl, projectKey }, correlationId);
    const sonarAdmin = new SonarAdmin(sonarUrl, token);

    // Try to validate connection with more detailed error
    let isValid = false;
    try {
      isValid = await sonarAdmin.validateConnection();
    } catch (error: any) {
      throw new Error(
        `Cannot connect to SonarQube at ${sonarUrl}.\n\n` +
        `Details: ${error.message}\n\n` +
        `Please verify:\n` +
        `  1. SonarQube server is running at ${sonarUrl}\n` +
        `  2. The token is valid and has not expired\n` +
        `  3. The token has appropriate permissions\n\n` +
        `You can test the connection manually:\n` +
        `  curl -u TOKEN: ${sonarUrl}/api/authentication/validate`
      );
    }

    if (!isValid) {
      throw new Error(
        `SonarQube authentication failed at ${sonarUrl}.\n\n` +
        `The token appears to be invalid or has insufficient permissions.\n\n` +
        `Please verify:\n` +
        `  1. The token is correct and not expired\n` +
        `  2. The token has at least 'Browse' permissions\n` +
        `  3. You can test with: curl -u YOUR_TOKEN: ${sonarUrl}/api/authentication/validate`
      );
    }

    const projectExists = await sonarAdmin.projectExists(projectKey);
    if (!projectExists) {
      throw new Error(
        `Project '${projectKey}' does not exist on SonarQube server ${sonarUrl}.\n\n` +
        `Please verify:\n` +
        `  1. The project key is spelled correctly\n` +
        `  2. The project exists in SonarQube: ${sonarUrl}/projects\n` +
        `  3. Your token has access to view this project\n\n` +
        `If you haven't created the project yet, you can:\n` +
        `  • Create it manually in SonarQube UI\n` +
        `  • Use 'sonar_auto_setup' to create a new project automatically`
      );
    }

    logger.info('Project verified successfully', { projectKey }, correlationId);

    // 2. Check if bobthefixer.env already exists
    const configPath = path.join(projectPath, 'bobthefixer.env');
    let existingConfig: ProjectConfig | null = null;

    try {
      const existingContent = await fs.readFile(configPath, 'utf-8');
      const lines = existingContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      const config: any = {};
      for (const line of lines) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const envKey = key.trim();
          const value = valueParts.join('=').trim();

          if (envKey === 'SONAR_PROJECT_KEY') {
            config.sonarProjectKey = value;
          }
        }
      }

      if (config.sonarProjectKey) {
        existingConfig = config as ProjectConfig;
      }
    } catch {
      // File doesn't exist, that's okay
    }

    // 3. Create or update bobthefixer.env
    const config: ProjectConfig = {
      sonarUrl,
      sonarToken: token,
      sonarProjectKey: projectKey,
      createdAt: new Date().toISOString()
    };

    await saveConfigToFile(configPath, config);
    logger.info('Configuration file created', { configPath }, correlationId);

    // 4. Update .gitignore
    await updateGitignore(projectPath);

    // 5. Build success message
    const message = buildSuccessMessage(projectKey, sonarUrl, configPath, existingConfig);

    return {
      content: [{ type: 'text', text: message }]
    };
  } catch (error: any) {
    logger.error('Failed to link existing project', error, {}, correlationId);
    throw new Error(`Failed to link existing project: ${error.message}`);
  }
}

/**
 * Save configuration to bobthefixer.env file
 */
async function saveConfigToFile(configPath: string, config: ProjectConfig): Promise<void> {
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

  await fs.writeFile(configPath, content + '\n', 'utf-8');
}

/**
 * Update .gitignore to exclude bobthefixer.env
 */
async function updateGitignore(projectPath: string): Promise<void> {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const GITIGNORE_ENTRY = 'bobthefixer.env';

  try {
    let gitignoreContent = '';
    try {
      gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      // .gitignore doesn't exist, will create it
    }

    if (!gitignoreContent.includes(GITIGNORE_ENTRY)) {
      const newContent = gitignoreContent +
        (gitignoreContent && !gitignoreContent.endsWith('\n') ? '\n' : '') +
        `\n# Bob the Fixer local configuration\n${GITIGNORE_ENTRY}\n`;

      await fs.writeFile(gitignorePath, newContent, 'utf-8');
    }
  } catch (error) {
    // Non-fatal error
    console.warn('Could not update .gitignore:', error);
  }
}

/**
 * Build success message
 */
function buildSuccessMessage(
  projectKey: string,
  sonarUrl: string,
  configPath: string,
  existingConfig: ProjectConfig | null
): string {
  let message = '✅ Successfully linked existing SonarQube project!\n\n';

  if (existingConfig) {
    message += `⚠️  WARNING: Existing configuration was found and has been overwritten.\n`;
    message += `   Previous project key: ${existingConfig.sonarProjectKey}\n\n`;
  }

  message += `📋 Project Details:\n`;
  message += `   • Project Key: ${projectKey}\n`;
  message += `   • SonarQube URL: ${sonarUrl}\n`;
  message += `   • Config File: ${configPath}\n\n`;

  message += `🎯 Next Steps:\n`;
  message += `   1. Run a scan: sonar_scan_project with autoSetup: false\n`;
  message += `   2. Bob will use the existing project for all scans\n`;
  message += `   3. The bobthefixer.env file is now in .gitignore\n\n`;

  message += `💡 Note: You can now use all Bob the Fixer tools with this project.\n`;
  message += `   The local configuration links this directory to the SonarQube project.`;

  return message;
}
