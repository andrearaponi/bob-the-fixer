import { z } from 'zod';

// Environment variables validation
export const EnvironmentSchema = z.object({
  SONAR_URL: z.string()
    .url('SONAR_URL must be a valid URL')
    .refine(url => url.startsWith('http://') || url.startsWith('https://'), {
      message: 'SONAR_URL must start with http:// or https://'
    })
    .refine(url => !url.includes('localhost') || process.env.NODE_ENV !== 'production', {
      message: 'localhost URLs not allowed in production'
    }),
  SONAR_TOKEN: z.string()
    .min(20, 'SONAR_TOKEN must be at least 20 characters')
    .max(200, 'SONAR_TOKEN too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'SONAR_TOKEN contains invalid characters'),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
});

// Path validation - prevent path traversal
const SafePathSchema = z.string()
  .min(1, 'Path cannot be empty')
  .max(1000, 'Path too long')
  .refine(path => !path.includes('..'), 'Path traversal not allowed')
  .refine(path => !path.includes('\0'), 'Null bytes not allowed')
  .refine(path => !/[<>"|?*]/.test(path), 'Invalid path characters')
  .transform(path => path.trim());

// Project key validation
const ProjectKeySchema = z.string()
  .min(1, 'Project key cannot be empty')
  .max(400, 'Project key too long')
  .regex(/^[a-zA-Z0-9._:-]+$/, 'Project key contains invalid characters');

// Severity filter validation
const SeveritySchema = z.enum(['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER']);

// Issue type validation
const IssueTypeSchema = z.enum(['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT']);

// Tool input schemas
export const SonarAutoSetupSchema = z.object({
  force: z.boolean().optional().default(false),
  template: z.enum(['strict', 'balanced', 'permissive']).optional().default('balanced')
});

export const SonarProjectDiscoverySchema = z.object({
  path: SafePathSchema.optional(),
  deep: z.boolean().optional().default(false)
});

export const SonarScanProjectSchema = z.object({
  projectPath: SafePathSchema.optional(),
  severityFilter: z.array(SeveritySchema).optional(),
  typeFilter: z.array(IssueTypeSchema).optional(),
  autoSetup: z.boolean().optional()
});

export const SonarGetIssueDetailsSchema = z.object({
  issueKey: z.string()
    .min(1, 'Issue key cannot be empty')
    .max(100, 'Issue key too long')
    .regex(/^[a-zA-Z0-9_:-]+$/, 'Issue key contains invalid characters'),
  contextLines: z.number()
    .int('Context lines must be integer')
    .min(0, 'Context lines cannot be negative')
    .max(100, 'Too many context lines')
    .optional()
    .default(5),
  includeRuleDetails: z.boolean().optional().default(true),
  includeCodeExamples: z.boolean().optional().default(true),
  includeFilePath: z.boolean().optional().default(true)
});

export const SonarGenerateReportSchema = z.object({
  format: z.enum(['summary', 'detailed', 'json']).optional().default('summary'),
  outputPath: SafePathSchema.optional()
});

export const SonarConfigManagerSchema = z.object({
  action: z.enum(['get', 'set', 'validate', 'reset']),
  key: z.string().optional(),
  value: z.string().optional()
});

export const SonarCleanupSchema = z.object({
  olderThanDays: z.number()
    .int('Days must be integer')
    .min(1, 'Days must be at least 1')
    .max(365, 'Days cannot exceed 365')
    .optional()
    .default(30),
  dryRun: z.boolean().optional().default(true)
});

export const SonarGetSecurityHotspotsSchema = z.object({
  statuses: z.array(z.enum(['TO_REVIEW', 'REVIEWED'])).optional(),
  resolutions: z.array(z.enum(['FIXED', 'SAFE', 'ACKNOWLEDGED'])).optional(),
  severities: z.array(z.enum(['HIGH', 'MEDIUM', 'LOW'])).optional()
});

export const SonarGetSecurityHotspotDetailsSchema = z.object({
  hotspotKey: z.string()
    .min(1, 'Hotspot key cannot be empty')
    .max(100, 'Hotspot key too long')
    .regex(/^[a-zA-Z0-9_:-]+$/, 'Hotspot key contains invalid characters'),
  includeRuleDetails: z.boolean().optional().default(true),
  includeFilePath: z.boolean().optional().default(true),
  contextLines: z.number().int().min(1).max(50).optional().default(10)
});

export const SonarGetProjectMetricsSchema = z.object({
  metrics: z.array(z.string()
    .min(1, 'Metric name cannot be empty')
    .max(100, 'Metric name too long')
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Metric name contains invalid characters')
  ).optional()
});

export const SonarDeleteProjectSchema = z.object({
  projectKey: ProjectKeySchema,
  confirm: z.boolean().refine(val => val === true, 'Must confirm deletion')
});

// Custom error for validation failures
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Input validation helper
export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown, toolName: string): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues || [];
      const errorMessage = errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new ValidationError(`${toolName} validation failed: ${errorMessage}`, errors);
    }
    throw new ValidationError(`${toolName} validation failed: ${error}`, []);
  }
}

// Environment validation helper
export function validateEnvironment(): z.infer<typeof EnvironmentSchema> {
  const env = {
    SONAR_URL: process.env.SONAR_URL,
    SONAR_TOKEN: process.env.SONAR_TOKEN,
    NODE_ENV: process.env.NODE_ENV
  };

  try {
    return EnvironmentSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues || [];
      const errorMessage = errors
        .map(err => `${err.path.join('.')}: ${err.message}`)
        .join(', ');
      throw new ValidationError(`Environment validation failed: ${errorMessage}`, errors);
    }
    throw new ValidationError(`Environment validation failed: ${error}`, []);
  }
}

// Code duplication schemas
export const SonarGetDuplicationSummarySchema = z.object({
  pageSize: z.number().min(1).max(500).optional().default(100),
  sortBy: z.enum(['density', 'lines', 'blocks']).optional().default('density').describe('Sort by: density (%), lines (absolute), or blocks'),
  maxResults: z.number().min(1).max(50).optional().default(10).describe('Maximum files to show in results'),
}).describe('[EN] Get ranked list of files with code duplication, sortable by density (%), absolute lines, or blocks. Shows priority indicators and refactoring recommendations.');

export const SonarGetDuplicationDetailsSchema = z.object({
  fileKey: z.string().min(1).describe('File key from SonarQube (e.g., project:path/to/file.java)'),
  includeRecommendations: z.boolean().optional().default(true).describe('Include specific refactoring recommendations'),
}).describe('[EN] Analyze specific file duplication with exact line ranges, affected files, and targeted refactoring recommendations for each duplicate block.');

export const SonarGetTechnicalDebtSchema = z.object({
  includeBudgetAnalysis: z.boolean().optional().default(true).describe('Include time budget analysis and planning recommendations'),
}).describe('[EN] Comprehensive technical debt analysis with time estimates, budget planning, ROI calculations, and prioritized action plan for bugs, vulnerabilities, and code smells.');

export const SonarAnalyzePatternsSchema = z.object({
  groupBy: z.enum(['pattern', 'file', 'severity', 'fixability']).optional().default('pattern').describe('How to organize the analysis: pattern (by rule), file (by file), severity (by severity), or fixability (by difficulty)'),
  includeImpact: z.boolean().optional().default(true).describe('Include estimated time/effort and impact reduction'),
  includeCorrelations: z.boolean().optional().default(true).describe('Identify related issues that could be fixed together'),
}).describe('[EN] Intelligently analyze and group SonarQube issues to identify patterns, correlations, and provide actionable insights for automated fixing. Groups issues by selected strategy and provides fixability scoring, time estimates, and impact analysis.');

export const SonarLinkExistingProjectSchema = z.object({
  sonarUrl: z.string()
    .url('SonarQube URL must be a valid URL')
    .refine(url => url.startsWith('http://') || url.startsWith('https://'), {
      message: 'SonarQube URL must start with http:// or https://'
    })
    .describe('SonarQube server URL (e.g., http://localhost:9000)'),
  projectKey: ProjectKeySchema.describe('Existing SonarQube project key'),
  token: z.string()
    .min(20, 'Token must be at least 20 characters')
    .max(200, 'Token too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Token contains invalid characters')
    .describe('SonarQube authentication token with project access permissions'),
  projectPath: SafePathSchema.optional().describe('Path to the project directory (defaults to current working directory)')
}).describe('[EN] Link an existing SonarQube project to the current directory. Creates local bobthefixer.env configuration file.');

export const SonarGetCoverageGapsSchema = z.object({
  componentKey: z.string()
    .min(1, 'Component key cannot be empty')
    .max(500, 'Component key too long')
    .describe('SonarQube component key (e.g., "project:src/main/java/Calculator.java")'),
  minGapSize: z.number()
    .int('Gap size must be integer')
    .min(1, 'Gap size must be at least 1')
    .max(50, 'Gap size cannot exceed 50')
    .optional()
    .default(1)
    .describe('Minimum number of consecutive uncovered lines to report as a gap'),
  includePartialBranch: z.boolean()
    .optional()
    .default(true)
    .describe('Include lines with partial branch coverage')
}).describe('[EN] Analyze code coverage gaps for a specific file. Returns uncovered code blocks and partial branch coverage with code snippets, optimized for LLM-assisted test generation.');

export const SonarGetUncoveredFilesSchema = z.object({
  targetCoverage: z.number()
    .min(0, 'Target coverage cannot be negative')
    .max(100, 'Target coverage cannot exceed 100')
    .optional()
    .default(100)
    .describe('Target coverage percentage. Files below this threshold will be returned (default: 100)'),
  maxFiles: z.number()
    .int('Max files must be integer')
    .min(1, 'Max files must be at least 1')
    .max(500, 'Max files cannot exceed 500')
    .optional()
    .default(50)
    .describe('Maximum number of files to return (default: 50)'),
  sortBy: z.enum(['coverage', 'uncovered_lines', 'name'])
    .optional()
    .default('coverage')
    .describe('Sort order: coverage (lowest first), uncovered_lines (most first), name (alphabetical)'),
  includeNoCoverageData: z.boolean()
    .optional()
    .default(false)
    .describe('Include files without coverage data (projects never scanned with coverage)')
}).describe('[EN] Get list of files with coverage below target threshold. Handles projects without coverage data by providing setup instructions. Returns prioritized list with critical/high/medium/low priority levels.');

// Module configuration for multi-module projects
const SonarModuleConfigSchema = z.object({
  name: z.string()
    .min(1, 'Module name cannot be empty')
    .max(100, 'Module name too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Module name contains invalid characters')
    .describe('Module name (used as identifier in sonar.modules)'),
  baseDir: z.string()
    .min(1, 'Base directory cannot be empty')
    .describe('Module base directory relative to project root'),
  sources: z.string()
    .min(1, 'Sources cannot be empty')
    .describe('Comma-separated source directories'),
  tests: z.string()
    .optional()
    .describe('Comma-separated test directories'),
  binaries: z.string()
    .optional()
    .describe('Java/Kotlin compiled classes directory'),
  exclusions: z.string()
    .optional()
    .describe('Comma-separated exclusion patterns for this module'),
  language: z.string()
    .optional()
    .describe('Primary language for this module')
});

export const SonarGenerateConfigSchema = z.object({
  projectPath: SafePathSchema.optional()
    .describe('Project directory path (defaults to current working directory)'),
  autoDetect: z.boolean()
    .optional()
    .default(true)
    .describe('Automatically detect project properties (sources, binaries, libraries). User-provided values override detected values. Default: true'),
  libraryPathStrategy: z.enum(['absolute', 'relative', 'glob'])
    .optional()
    .default('relative')
    .describe('How to handle library paths: absolute (keep full paths), relative (convert to project-relative), glob (use patterns). Default: relative'),
  config: z.object({
    projectKey: ProjectKeySchema.optional()
      .describe('SonarQube project key (optional - will use from bobthefixer.env if not provided)'),
    projectName: z.string()
      .max(200, 'Project name too long')
      .optional()
      .describe('Human-readable project name'),
    projectVersion: z.string()
      .max(50, 'Version too long')
      .optional()
      .describe('Project version'),
    sources: z.string()
      .optional()
      .describe('Comma-separated source directories (e.g., "src,lib"). Auto-detected if not provided'),
    tests: z.string()
      .optional()
      .describe('Comma-separated test directories'),
    exclusions: z.string()
      .optional()
      .describe('Comma-separated exclusion patterns (e.g., "**/node_modules/**,**/dist/**")'),
    encoding: z.string()
      .optional()
      .default('UTF-8')
      .describe('Source file encoding'),
    modules: z.array(SonarModuleConfigSchema)
      .optional()
      .describe('Multi-module project configuration'),
    javaBinaries: z.string()
      .optional()
      .describe('Java compiled classes directory (for Java projects)'),
    javaTestBinaries: z.string()
      .optional()
      .describe('Java test compiled classes directory'),
    javaLibraries: z.string()
      .optional()
      .describe('Path to Java libraries'),
    javaSource: z.string()
      .optional()
      .describe('Java source version (e.g., "11", "17")'),
    coverageReportPaths: z.string()
      .optional()
      .describe('Path to coverage report files'),
    additionalProperties: z.record(z.string())
      .optional()
      .describe('Additional SonarQube properties as key-value pairs')
  }).optional()
    .describe('SonarQube project configuration (optional when autoDetect is true)')
}).describe('[EN] Generate sonar-project.properties file with auto-detection. Automatically detects project properties; user values override detected ones.');