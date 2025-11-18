import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EnvironmentSchema,
  SonarAutoSetupSchema,
  SonarProjectDiscoverySchema,
  SonarScanProjectSchema,
  SonarGetIssueDetailsSchema,
  SonarGenerateReportSchema,
  SonarConfigManagerSchema,
  SonarCleanupSchema,
  SonarGetSecurityHotspotsSchema,
  SonarGetSecurityHotspotDetailsSchema,
  SonarGetProjectMetricsSchema,
  SonarDeleteProjectSchema,
  SonarGetDuplicationSummarySchema,
  SonarGetDuplicationDetailsSchema,
  SonarGetTechnicalDebtSchema,
  validateInput,
  validateEnvironment,
  ValidationError,
} from './mcp-schemas';
import { z } from 'zod';

describe('EnvironmentSchema', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // vi.resetModules(); // Removed: interferes with Zod's error handling
    process.env = { ...originalEnv };
  });

  it('should validate correct environment variables', () => {
    const validEnv = {
      SONAR_URL: 'http://localhost:9000',
      SONAR_TOKEN: 'sqp_1234567890abcdefghijklmnopqrstuvwxyz',
      NODE_ENV: 'development',
    };

    expect(() => EnvironmentSchema.parse(validEnv)).not.toThrow();
  });

  it('should validate HTTPS URLs', () => {
    const validEnv = {
      SONAR_URL: 'https://sonarcloud.io',
      SONAR_TOKEN: 'sqp_1234567890abcdefghijklmnopqrstuvwxyz',
    };

    expect(() => EnvironmentSchema.parse(validEnv)).not.toThrow();
  });

  it('should reject invalid URL format', () => {
    const invalidEnv = {
      SONAR_URL: 'not-a-url',
      SONAR_TOKEN: 'sqp_1234567890abcdefghijklmnopqrstuvwxyz',
    };

    expect(() => EnvironmentSchema.parse(invalidEnv)).toThrow();
  });

  it('should reject URL without http/https', () => {
    const invalidEnv = {
      SONAR_URL: 'ftp://localhost:9000',
      SONAR_TOKEN: 'sqp_1234567890abcdefghijklmnopqrstuvwxyz',
    };

    expect(() => EnvironmentSchema.parse(invalidEnv)).toThrow('must start with http');
  });

  it('should reject short SONAR_TOKEN', () => {
    const invalidEnv = {
      SONAR_URL: 'http://localhost:9000',
      SONAR_TOKEN: 'short',
    };

    expect(() => EnvironmentSchema.parse(invalidEnv)).toThrow('at least 20 characters');
  });

  it('should reject SONAR_TOKEN with invalid characters', () => {
    const invalidEnv = {
      SONAR_URL: 'http://localhost:9000',
      SONAR_TOKEN: 'sqp_1234567890@#$%^&*()abcdefg',
    };

    expect(() => EnvironmentSchema.parse(invalidEnv)).toThrow('invalid characters');
  });

  it('should accept optional NODE_ENV', () => {
    const validEnv = {
      SONAR_URL: 'http://localhost:9000',
      SONAR_TOKEN: 'sqp_1234567890abcdefghijklmnopqrstuvwxyz',
    };

    const result = EnvironmentSchema.parse(validEnv);
    expect(result.NODE_ENV).toBeUndefined();
  });

  it('should validate NODE_ENV enum values', () => {
    const validEnvs = ['development', 'production', 'test'];

    validEnvs.forEach((env) => {
      const validEnv = {
        SONAR_URL: 'http://localhost:9000',
        SONAR_TOKEN: 'sqp_1234567890abcdefghijklmnopqrstuvwxyz',
        NODE_ENV: env,
      };

      expect(() => EnvironmentSchema.parse(validEnv)).not.toThrow();
    });
  });
});

describe('SonarAutoSetupSchema', () => {
  it('should apply default values', () => {
    const result = SonarAutoSetupSchema.parse({});
    expect(result.force).toBe(false);
    expect(result.template).toBe('balanced');
  });

  it('should accept valid template values', () => {
    const templates = ['strict', 'balanced', 'permissive'];

    templates.forEach((template) => {
      const result = SonarAutoSetupSchema.parse({ template });
      expect(result.template).toBe(template);
    });
  });

  it('should reject invalid template', () => {
    expect(() => SonarAutoSetupSchema.parse({ template: 'invalid' })).toThrow();
  });

  it('should accept force flag', () => {
    const result = SonarAutoSetupSchema.parse({ force: true });
    expect(result.force).toBe(true);
  });
});

describe('SonarProjectDiscoverySchema', () => {
  it('should apply default values', () => {
    const result = SonarProjectDiscoverySchema.parse({});
    expect(result.deep).toBe(false);
    expect(result.path).toBeUndefined();
  });

  it('should accept valid path', () => {
    const result = SonarProjectDiscoverySchema.parse({ path: 'src/main' });
    expect(result.path).toBe('src/main');
  });

  it('should reject path traversal', () => {
    expect(() => SonarProjectDiscoverySchema.parse({ path: '../etc/passwd' })).toThrow('Path traversal');
  });

  it('should reject path with null bytes', () => {
    expect(() => SonarProjectDiscoverySchema.parse({ path: 'src\0main' })).toThrow('Null bytes');
  });

  it('should reject path with invalid characters', () => {
    const invalidPaths = ['src<main', 'src>main', 'src|main', 'src?main', 'src*main', 'src"main'];

    invalidPaths.forEach((path) => {
      expect(() => SonarProjectDiscoverySchema.parse({ path })).toThrow('Invalid path characters');
    });
  });

  it('should trim path whitespace', () => {
    const result = SonarProjectDiscoverySchema.parse({ path: '  src/main  ' });
    expect(result.path).toBe('src/main');
  });

  it('should accept deep flag', () => {
    const result = SonarProjectDiscoverySchema.parse({ deep: true });
    expect(result.deep).toBe(true);
  });
});

describe('SonarScanProjectSchema', () => {
  it('should accept valid scan configuration', () => {
    const config = {
      projectPath: 'src/project',
      severityFilter: ['CRITICAL', 'BLOCKER'],
      typeFilter: ['BUG', 'VULNERABILITY'],
      autoSetup: true,
    };

    const result = SonarScanProjectSchema.parse(config);
    expect(result.projectPath).toBe('src/project');
    expect(result.severityFilter).toEqual(['CRITICAL', 'BLOCKER']);
    expect(result.typeFilter).toEqual(['BUG', 'VULNERABILITY']);
    expect(result.autoSetup).toBe(true);
  });

  it('should accept all severity levels', () => {
    const severities = ['INFO', 'MINOR', 'MAJOR', 'CRITICAL', 'BLOCKER'];

    const result = SonarScanProjectSchema.parse({ severityFilter: severities });
    expect(result.severityFilter).toEqual(severities);
  });

  it('should accept all issue types', () => {
    const types = ['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'];

    const result = SonarScanProjectSchema.parse({ typeFilter: types });
    expect(result.typeFilter).toEqual(types);
  });

  it('should reject invalid severity', () => {
    expect(() =>
      SonarScanProjectSchema.parse({ severityFilter: ['INVALID'] })
    ).toThrow();
  });

  it('should reject invalid issue type', () => {
    expect(() =>
      SonarScanProjectSchema.parse({ typeFilter: ['INVALID_TYPE'] })
    ).toThrow();
  });
});

describe('SonarGetIssueDetailsSchema', () => {
  it('should validate correct issue key', () => {
    const config = {
      issueKey: 'AX1234567890-abcdef',
      contextLines: 10,
    };

    const result = SonarGetIssueDetailsSchema.parse(config);
    expect(result.issueKey).toBe('AX1234567890-abcdef');
    expect(result.contextLines).toBe(10);
  });

  it('should apply default values', () => {
    const result = SonarGetIssueDetailsSchema.parse({ issueKey: 'AX123' });
    expect(result.contextLines).toBe(5);
    expect(result.includeRuleDetails).toBe(true);
    expect(result.includeCodeExamples).toBe(true);
    expect(result.includeFilePath).toBe(true);
  });

  it('should reject empty issue key', () => {
    expect(() => SonarGetIssueDetailsSchema.parse({ issueKey: '' })).toThrow('cannot be empty');
  });

  it('should reject issue key with invalid characters', () => {
    expect(() =>
      SonarGetIssueDetailsSchema.parse({ issueKey: 'AX123@#$%' })
    ).toThrow('invalid characters');
  });

  it('should reject negative context lines', () => {
    expect(() =>
      SonarGetIssueDetailsSchema.parse({ issueKey: 'AX123', contextLines: -1 })
    ).toThrow('cannot be negative');
  });

  it('should reject too many context lines', () => {
    expect(() =>
      SonarGetIssueDetailsSchema.parse({ issueKey: 'AX123', contextLines: 150 })
    ).toThrow('Too many context lines');
  });

  it('should reject non-integer context lines', () => {
    expect(() =>
      SonarGetIssueDetailsSchema.parse({ issueKey: 'AX123', contextLines: 5.5 })
    ).toThrow('must be integer');
  });
});

describe('SonarGenerateReportSchema', () => {
  it('should apply default format', () => {
    const result = SonarGenerateReportSchema.parse({});
    expect(result.format).toBe('summary');
  });

  it('should accept all format values', () => {
    const formats = ['summary', 'detailed', 'json'];

    formats.forEach((format) => {
      const result = SonarGenerateReportSchema.parse({ format });
      expect(result.format).toBe(format);
    });
  });

  it('should reject invalid format', () => {
    expect(() => SonarGenerateReportSchema.parse({ format: 'xml' })).toThrow();
  });

  it('should accept valid output path', () => {
    const result = SonarGenerateReportSchema.parse({ outputPath: 'reports/sonar.json' });
    expect(result.outputPath).toBe('reports/sonar.json');
  });

  it('should reject path with traversal', () => {
    expect(() =>
      SonarGenerateReportSchema.parse({ outputPath: '../../etc/report' })
    ).toThrow('Path traversal');
  });
});

describe('SonarConfigManagerSchema', () => {
  it('should accept valid actions', () => {
    const actions = ['get', 'set', 'validate', 'reset'];

    actions.forEach((action) => {
      const result = SonarConfigManagerSchema.parse({ action });
      expect(result.action).toBe(action);
    });
  });

  it('should reject invalid action', () => {
    expect(() => SonarConfigManagerSchema.parse({ action: 'invalid' })).toThrow();
  });

  it('should accept optional key and value', () => {
    const result = SonarConfigManagerSchema.parse({
      action: 'set',
      key: 'sonarUrl',
      value: 'http://localhost:9000',
    });

    expect(result.key).toBe('sonarUrl');
    expect(result.value).toBe('http://localhost:9000');
  });
});

describe('SonarCleanupSchema', () => {
  it('should apply default values', () => {
    const result = SonarCleanupSchema.parse({});
    expect(result.olderThanDays).toBe(30);
    expect(result.dryRun).toBe(true);
  });

  it('should accept valid days', () => {
    const result = SonarCleanupSchema.parse({ olderThanDays: 60 });
    expect(result.olderThanDays).toBe(60);
  });

  it('should reject days less than 1', () => {
    expect(() => SonarCleanupSchema.parse({ olderThanDays: 0 })).toThrow('at least 1');
  });

  it('should reject days greater than 365', () => {
    expect(() => SonarCleanupSchema.parse({ olderThanDays: 400 })).toThrow('cannot exceed 365');
  });

  it('should reject non-integer days', () => {
    expect(() => SonarCleanupSchema.parse({ olderThanDays: 30.5 })).toThrow('must be integer');
  });

  it('should accept dryRun flag', () => {
    const result = SonarCleanupSchema.parse({ dryRun: false });
    expect(result.dryRun).toBe(false);
  });
});

describe('SonarGetSecurityHotspotsSchema', () => {
  it('should accept all status values', () => {
    const result = SonarGetSecurityHotspotsSchema.parse({
      statuses: ['TO_REVIEW', 'REVIEWED'],
    });

    expect(result.statuses).toEqual(['TO_REVIEW', 'REVIEWED']);
  });

  it('should accept all resolution values', () => {
    const result = SonarGetSecurityHotspotsSchema.parse({
      resolutions: ['FIXED', 'SAFE', 'ACKNOWLEDGED'],
    });

    expect(result.resolutions).toEqual(['FIXED', 'SAFE', 'ACKNOWLEDGED']);
  });

  it('should accept all severity values', () => {
    const result = SonarGetSecurityHotspotsSchema.parse({
      severities: ['HIGH', 'MEDIUM', 'LOW'],
    });

    expect(result.severities).toEqual(['HIGH', 'MEDIUM', 'LOW']);
  });

  it('should reject invalid status', () => {
    expect(() =>
      SonarGetSecurityHotspotsSchema.parse({ statuses: ['INVALID'] })
    ).toThrow();
  });
});

describe('SonarGetSecurityHotspotDetailsSchema', () => {
  it('should validate correct hotspot key', () => {
    const result = SonarGetSecurityHotspotDetailsSchema.parse({
      hotspotKey: 'AX123-hotspot',
    });

    expect(result.hotspotKey).toBe('AX123-hotspot');
  });

  it('should apply default values', () => {
    const result = SonarGetSecurityHotspotDetailsSchema.parse({
      hotspotKey: 'AX123',
    });

    expect(result.includeRuleDetails).toBe(true);
    expect(result.includeFilePath).toBe(true);
  });

  it('should reject empty hotspot key', () => {
    expect(() =>
      SonarGetSecurityHotspotDetailsSchema.parse({ hotspotKey: '' })
    ).toThrow('cannot be empty');
  });

  it('should reject hotspot key with invalid characters', () => {
    expect(() =>
      SonarGetSecurityHotspotDetailsSchema.parse({ hotspotKey: 'AX@#$' })
    ).toThrow('invalid characters');
  });
});

describe('SonarGetProjectMetricsSchema', () => {
  it('should accept valid metric names', () => {
    const result = SonarGetProjectMetricsSchema.parse({
      metrics: ['coverage', 'bugs', 'code_smells'],
    });

    expect(result.metrics).toEqual(['coverage', 'bugs', 'code_smells']);
  });

  it('should accept optional metrics', () => {
    const result = SonarGetProjectMetricsSchema.parse({});
    expect(result.metrics).toBeUndefined();
  });

  it('should reject empty metric name', () => {
    expect(() =>
      SonarGetProjectMetricsSchema.parse({ metrics: [''] })
    ).toThrow('cannot be empty');
  });

  it('should reject metric with invalid characters', () => {
    expect(() =>
      SonarGetProjectMetricsSchema.parse({ metrics: ['invalid@metric'] })
    ).toThrow('invalid characters');
  });

  it('should accept metric names with dots and dashes', () => {
    const result = SonarGetProjectMetricsSchema.parse({
      metrics: ['new-coverage', 'lines.of.code'],
    });

    expect(result.metrics).toEqual(['new-coverage', 'lines.of.code']);
  });
});

describe('SonarDeleteProjectSchema', () => {
  it('should validate correct project key and confirmation', () => {
    const result = SonarDeleteProjectSchema.parse({
      projectKey: 'my-project-key',
      confirm: true,
    });

    expect(result.projectKey).toBe('my-project-key');
    expect(result.confirm).toBe(true);
  });

  it('should reject without confirmation', () => {
    expect(() =>
      SonarDeleteProjectSchema.parse({
        projectKey: 'my-project',
        confirm: false,
      })
    ).toThrow('Must confirm deletion');
  });

  it('should accept project key with special characters', () => {
    const result = SonarDeleteProjectSchema.parse({
      projectKey: 'org.example:my-project_v1.0',
      confirm: true,
    });

    expect(result.projectKey).toBe('org.example:my-project_v1.0');
  });

  it('should reject empty project key', () => {
    expect(() =>
      SonarDeleteProjectSchema.parse({ projectKey: '', confirm: true })
    ).toThrow('cannot be empty');
  });

  it('should reject project key with invalid characters', () => {
    expect(() =>
      SonarDeleteProjectSchema.parse({ projectKey: 'invalid@project', confirm: true })
    ).toThrow('invalid characters');
  });
});

describe('SonarGetDuplicationSummarySchema', () => {
  it('should apply default values', () => {
    const result = SonarGetDuplicationSummarySchema.parse({});
    expect(result.pageSize).toBe(100);
    expect(result.sortBy).toBe('density');
    expect(result.maxResults).toBe(10);
  });

  it('should accept valid sortBy values', () => {
    const sortOptions = ['density', 'lines', 'blocks'];

    sortOptions.forEach((sortBy) => {
      const result = SonarGetDuplicationSummarySchema.parse({ sortBy });
      expect(result.sortBy).toBe(sortBy);
    });
  });

  it('should reject pageSize below minimum', () => {
    expect(() =>
      SonarGetDuplicationSummarySchema.parse({ pageSize: 0 })
    ).toThrow();
  });

  it('should reject pageSize above maximum', () => {
    expect(() =>
      SonarGetDuplicationSummarySchema.parse({ pageSize: 600 })
    ).toThrow();
  });

  it('should reject maxResults above maximum', () => {
    expect(() =>
      SonarGetDuplicationSummarySchema.parse({ maxResults: 100 })
    ).toThrow();
  });
});

describe('SonarGetDuplicationDetailsSchema', () => {
  it('should validate correct file key', () => {
    const result = SonarGetDuplicationDetailsSchema.parse({
      fileKey: 'my-project:src/main/java/Main.java',
    });

    expect(result.fileKey).toBe('my-project:src/main/java/Main.java');
  });

  it('should apply default includeRecommendations', () => {
    const result = SonarGetDuplicationDetailsSchema.parse({
      fileKey: 'project:file.java',
    });

    expect(result.includeRecommendations).toBe(true);
  });

  it('should reject empty file key', () => {
    expect(() =>
      SonarGetDuplicationDetailsSchema.parse({ fileKey: '' })
    ).toThrow();
  });
});

describe('SonarGetTechnicalDebtSchema', () => {
  it('should apply default includeBudgetAnalysis', () => {
    const result = SonarGetTechnicalDebtSchema.parse({});
    expect(result.includeBudgetAnalysis).toBe(true);
  });

  it('should accept includeBudgetAnalysis flag', () => {
    const result = SonarGetTechnicalDebtSchema.parse({
      includeBudgetAnalysis: false,
    });

    expect(result.includeBudgetAnalysis).toBe(false);
  });
});

describe('validateInput', () => {
  const TestSchema = z.object({
    name: z.string().min(1),
    age: z.number().min(0),
  });

  it('should validate correct input', () => {
    const input = { name: 'John', age: 30 };
    const result = validateInput(TestSchema, input, 'TestTool');

    expect(result).toEqual(input);
  });

  it('should throw ValidationError on invalid input', () => {
    const input = { name: '', age: -1 };

    expect(() => validateInput(TestSchema, input, 'TestTool')).toThrow(ValidationError);
  });

  it('should include tool name in error message', () => {
    const input = { name: '', age: 30 };

    try {
      validateInput(TestSchema, input, 'MyCustomTool');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('MyCustomTool');
    }
  });

  it('should include validation errors', () => {
    const input = { name: '', age: 30 };

    try {
      validateInput(TestSchema, input, 'TestTool');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).validationErrors).toHaveLength(1);
      expect((error as ValidationError).validationErrors[0].path).toEqual(['name']);
    }
  });

  it('should handle non-ZodError exceptions', () => {
    const BadSchema = z.any().transform(() => {
      throw new Error('Custom error');
    });

    expect(() => validateInput(BadSchema, {}, 'TestTool')).toThrow(ValidationError);
  });
});

describe('validateEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // vi.resetModules(); // Removed: interferes with Zod's error handling
    process.env = { ...originalEnv };
  });

  it('should validate correct environment', () => {
    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'sqp_1234567890abcdefghijklmnopqrstuvwxyz';
    process.env.NODE_ENV = 'development';

    const result = validateEnvironment();

    expect(result.SONAR_URL).toBe('http://localhost:9000');
    expect(result.SONAR_TOKEN).toBe('sqp_1234567890abcdefghijklmnopqrstuvwxyz');
    expect(result.NODE_ENV).toBe('development');
  });

  it('should throw ValidationError on missing SONAR_URL', () => {
    delete process.env.SONAR_URL;
    process.env.SONAR_TOKEN = 'sqp_1234567890abcdefghijklmnopqrstuvwxyz';

    expect(() => validateEnvironment()).toThrow(ValidationError);
  });

  it('should throw ValidationError on invalid SONAR_TOKEN', () => {
    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'short';

    expect(() => validateEnvironment()).toThrow(ValidationError);
  });

  it('should include error details in message', () => {
    process.env.SONAR_URL = 'invalid-url';
    process.env.SONAR_TOKEN = 'sqp_1234567890abcdefghijklmnopqrstuvwxyz';

    try {
      validateEnvironment();
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('Environment validation failed');
    }
  });
});

describe('ValidationError', () => {
  it('should create error with validation errors', () => {
    const zodIssues: z.ZodIssue[] = [
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'number',
        path: ['name'],
        message: 'Expected string, received number',
      },
    ];

    const error = new ValidationError('Validation failed', zodIssues);

    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Validation failed');
    expect(error.validationErrors).toEqual(zodIssues);
  });

  it('should be instanceof Error', () => {
    const error = new ValidationError('Test error', []);
    expect(error).toBeInstanceOf(Error);
  });
});
