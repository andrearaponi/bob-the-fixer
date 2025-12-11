import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface ProjectConfig {
  sonarUrl: string;
  sonarToken: string;
  sonarProjectKey: string;
  createdAt: string;
  language?: string;
  framework?: string;
  logLevel?: string;
  forceCliScanner?: boolean;
}

export interface ProjectContext {
  path: string;
  name: string;
  language: string[];
  framework?: string;
  buildTool?: string;
  packageManager?: string;
}

export class ProjectManager {
  private readonly CONFIG_FILE = 'bobthefixer.env';
  private readonly GITIGNORE_ENTRY = 'bobthefixer.env';

  constructor(private workingDir: string = process.cwd()) {}

  /**
   * Get or create configuration for current project
   */
  async getOrCreateConfig(): Promise<ProjectConfig> {
    const configPath = path.join(this.workingDir, this.CONFIG_FILE);
    
    try {
      // Try to load existing configuration
      const existingConfig = await this.loadConfig(configPath);
      
      // Validate that configuration is still valid
      if (await this.validateConfig(existingConfig)) {
        return existingConfig;
      }
      
      console.error('Existing configuration invalid, creating new one...');
    } catch {
      console.error('No existing configuration found, creating new one...');
    }

    // Create new configuration
    return await this.createConfig(configPath);
  }

  /**
   * Load configuration from file
   */
  private async loadConfig(configPath: string): Promise<ProjectConfig> {
    const content = await fs.readFile(configPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    const config: any = {};
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        config[this.envKeyToCamelCase(key.trim())] = value;
      }
    }

    // IMPORTANT: Always prefer environment variables over file config
    if (process.env.SONAR_TOKEN) config.sonarToken = process.env.SONAR_TOKEN;
    if (process.env.SONAR_URL) config.sonarUrl = process.env.SONAR_URL;
    if (process.env.SONAR_PROJECT_KEY) config.sonarProjectKey = process.env.SONAR_PROJECT_KEY;
    
    // Validate required fields (Token is critical, others have defaults or can be generated)
    if (!config.sonarToken && !process.env.SONAR_TOKEN) {
      console.error('[ProjectManager] WARNING: No SONAR_TOKEN in environment or file!');
    }

    // Ensure defaults
    if (!config.sonarUrl) config.sonarUrl = 'http://localhost:9000';

    // Parse boolean for forceCliScanner
    if (config.forceCliScanner !== undefined) {
      config.forceCliScanner = config.forceCliScanner === 'true' || config.forceCliScanner === true;
    }

    return config as ProjectConfig;
  }

  /**
   * Ensures environment variables are synced to local config file.
   * This is critical for tools like Copilot CLI that might restart the process
   * without passing environment variables in subsequent runs.
   */
  async ensureConfigSync(): Promise<void> {
    try {
      const configPath = path.join(this.workingDir, this.CONFIG_FILE);
      let currentConfig: ProjectConfig;

      try {
        currentConfig = await this.loadConfig(configPath);
      } catch {
        // File doesn't exist - do NOT create it automatically
        // The file should only be created by explicit user actions (auto_setup, scan with autoSetup, link_project)
        // The Copilot workaround still works because the file is created during autosetup
        return;
      }

      // vars to sync
      const varsToSync = [
        { env: 'SONAR_TOKEN', config: 'sonarToken' },
        { env: 'SONAR_URL', config: 'sonarUrl' },
        { env: 'SONAR_PROJECT_KEY', config: 'sonarProjectKey' },
        { env: 'LOG_LEVEL', config: 'logLevel' } // Add logLevel support
      ];

      let needsSave = false;
      const configToSave: any = { ...currentConfig };

      for (const { env, config } of varsToSync) {
        const envValue = process.env[env];
        // If Env exists and is different/missing in file config, update file
        if (envValue && envValue !== (currentConfig as any)[config]) {
          console.error(`[ProjectManager] Caching ${env} from environment to file...`);
          configToSave[config] = envValue;
          needsSave = true;
        }
      }

      if (needsSave) {
        await this.saveConfig(configPath, configToSave);
      }
    } catch (error) {
      console.error('[ProjectManager] Failed to sync config:', error);
    }
  }

  /**
   * Create new configuration
   */
  private async createConfig(configPath: string): Promise<ProjectConfig> {
    const projectContext = await this.analyzeProject();
    const projectKey = this.generateProjectKey(projectContext);
    
    // CRITICAL: Check if SONAR_TOKEN is available from environment
    const token = process.env.SONAR_TOKEN;
    if (!token || token === '') {
      console.error('[ProjectManager] WARNING: SONAR_TOKEN not found in environment variables!');
      console.error('[ProjectManager] This will cause 401 errors. Token status:', {
        SONAR_TOKEN: process.env.SONAR_TOKEN ? 'SET' : 'UNDEFINED',
        length: process.env.SONAR_TOKEN?.length ?? 0
      });
    }
    
    const config: ProjectConfig = {
      sonarUrl: process.env.SONAR_URL ?? 'http://localhost:9000',
      sonarToken: token ?? 'temp-token-will-be-generated',
      sonarProjectKey: projectKey,
      createdAt: new Date().toISOString(),
      language: projectContext.language.join(','),
      framework: projectContext.framework
    };

    // Save configuration to file
    await this.saveConfig(configPath, config);
    
    // Update .gitignore
    await this.updateGitignore();

    return config;
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(configPath: string, config: ProjectConfig): Promise<void> {
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
      config.logLevel ? `LOG_LEVEL=${config.logLevel}` : '',
      config.forceCliScanner !== undefined ? `FORCE_CLI_SCANNER=${config.forceCliScanner}` : '',
    ].filter(Boolean).join('\n');

    await fs.writeFile(configPath, content, 'utf-8');
    console.error(`Configuration saved to ${configPath}`);
  }

  /**
   * Validate existing configuration
   */
  private async validateConfig(config: ProjectConfig): Promise<boolean> {
    // Basic validation - can be enhanced with API calls later
    if (!config.sonarUrl || !config.sonarToken || !config.sonarProjectKey) {
      return false;
    }

    // Check if configuration is too old (older than 30 days)
    const createdAt = new Date(config.createdAt);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (createdAt < thirtyDaysAgo) {
      console.error('Configuration is older than 30 days, will refresh...');
      return false;
    }

    return true;
  }

  /**
   * Analyze current project to determine language, framework, etc.
   */
  async analyzeProject(): Promise<ProjectContext> {
    const projectPath = this.workingDir;
    const projectName = path.basename(projectPath);
    const context: ProjectContext = {
      path: projectPath,
      name: projectName,
      language: [],
    };

    // Check for different project types
    await this.detectJavaScript(context);
    await this.detectTypeScript(context);
    await this.detectJava(context);
    await this.detectPython(context);
    await this.detectGo(context);
    await this.detectRust(context);
    await this.detectCSharp(context);

    // If no language detected, default to generic
    if (context.language.length === 0) {
      context.language.push('generic');
    }

    return context;
  }

  private async detectJavaScript(context: ProjectContext): Promise<void> {
    try {
      const packageJsonPath = path.join(context.path, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      
      context.language.push('javascript');
      context.packageManager = 'npm';

      // Detect frameworks
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (dependencies.react) {
        context.framework = 'react';
      } else if (dependencies.vue) {
        context.framework = 'vue';
      } else if (dependencies.angular || dependencies['@angular/core']) {
        context.framework = 'angular';
      } else if (dependencies.express) {
        context.framework = 'express';
      } else if (dependencies.next) {
        context.framework = 'nextjs';
      }

      // Detect build tools
      if (packageJson.scripts) {
        if (packageJson.scripts.build && dependencies.webpack) {
          context.buildTool = 'webpack';
        } else if (packageJson.scripts.build && dependencies.vite) {
          context.buildTool = 'vite';
        }
      }
    } catch {
      //package.json not found or invalid
    }
  }

  private async detectTypeScript(context: ProjectContext): Promise<void> {
    try {
      const tsconfigPath = path.join(context.path, 'tsconfig.json');
      await fs.access(tsconfigPath);
      
      if (!context.language.includes('typescript')) {
        context.language.push('typescript');
      }
    } catch {
      //tsconfig.json not found
    }
  }

  private async detectJava(context: ProjectContext): Promise<void> {
    try {
      // Check for Maven
      const pomPath = path.join(context.path, 'pom.xml');
      await fs.access(pomPath);
      context.language.push('java');
      context.buildTool = 'maven';
      
      // Detect Spring Boot
      const pomContent = await fs.readFile(pomPath, 'utf-8');
      if (pomContent.includes('spring-boot')) {
        context.framework = 'spring-boot';
      }
    } catch {
      try {
        // Check for Gradle
        const buildGradlePath = path.join(context.path, 'build.gradle');
        await fs.access(buildGradlePath);
        context.language.push('java');
        context.buildTool = 'gradle';
      } catch {
        // Neither Maven nor Gradle found
      }
    }
  }

  private async detectPython(context: ProjectContext): Promise<void> {
    const pythonFiles = ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'];
    
    for (const file of pythonFiles) {
      try {
        await fs.access(path.join(context.path, file));
        context.language.push('python');
        
        if (file === 'pyproject.toml') {
          context.buildTool = 'poetry';
        } else if (file === 'Pipfile') {
          context.buildTool = 'pipenv';
        } else {
          context.buildTool = 'pip';
        }
        break;
      } catch {
        // File not found
      }
    }
  }

  private async detectGo(context: ProjectContext): Promise<void> {
    try {
      const goModPath = path.join(context.path, 'go.mod');
      await fs.access(goModPath);
      context.language.push('go');
      context.buildTool = 'go-modules';
    } catch {
      //go.mod not found
    }
  }

  private async detectRust(context: ProjectContext): Promise<void> {
    try {
      const cargoPath = path.join(context.path, 'Cargo.toml');
      await fs.access(cargoPath);
      context.language.push('rust');
      context.buildTool = 'cargo';
    } catch {
      //Cargo.toml not found
    }
  }

  private async detectCSharp(context: ProjectContext): Promise<void> {
    try {
      const files = await fs.readdir(context.path);
      const csprojFile = files.find(f => f.endsWith('.csproj'));
      if (csprojFile) {
        context.language.push('csharp');
        context.buildTool = 'dotnet';
      }
    } catch {
      //Directory read failed or no .csproj files
    }
  }

  /**
   * Generate unique project key based on project path and name
   * Uses SHA-256 for better security than MD5
   */
  private generateProjectKey(context: ProjectContext): string {
    const baseName = context.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const pathHash = crypto.createHash('sha256').update(context.path).digest('hex').substring(0, 8);
    return `${baseName}-${pathHash}`;
  }

  /**
   * Update .gitignore to exclude bobthefixer.env
   */
  private async updateGitignore(): Promise<void> {
    const gitignorePath = path.join(this.workingDir, '.gitignore');

    try {
      let gitignoreContent = '';
      try {
        gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
      } catch {
        // .gitignore doesn't exist, will create it
      }

      if (!gitignoreContent.includes(this.GITIGNORE_ENTRY)) {
        const newContent = gitignoreContent +
          (gitignoreContent && !gitignoreContent.endsWith('\n') ? '\n' : '') +
          `\n# Bob the Fixer local configuration\n${this.GITIGNORE_ENTRY}\n`;

        await fs.writeFile(gitignorePath, newContent, 'utf-8');
        console.error('Updated .gitignore to exclude bobthefixer.env');
      }
    } catch (error) {
      console.warn('Could not update .gitignore:', error);
    }
  }

  /**
   * Convert environment variable key to camelCase
   */
  private envKeyToCamelCase(key: string): string {
    const mapping: Record<string, string> = {
      'SONAR_URL': 'sonarUrl',
      'SONAR_TOKEN': 'sonarToken',
      'SONAR_PROJECT_KEY': 'sonarProjectKey',
      'CREATED_AT': 'createdAt',
      'LANGUAGE': 'language',
      'FRAMEWORK': 'framework',
      'LOG_LEVEL': 'logLevel',
      'FORCE_CLI_SCANNER': 'forceCliScanner'
    };
    return mapping[key] || key.toLowerCase();
  }

  /**
   * Get current working directory
   */
  getWorkingDirectory(): string {
    return this.workingDir;
  }

  /**
   * Set working directory (useful for testing)
   */
  setWorkingDirectory(dir: string): void {
    this.workingDir = dir;
  }
}