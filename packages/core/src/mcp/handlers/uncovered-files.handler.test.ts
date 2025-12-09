import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetUncoveredFiles } from './uncovered-files.handler';

// Mock all dependencies
vi.mock('../../universal/project-manager');
vi.mock('../../shared/validators/mcp-schemas');
vi.mock('../../sonar/index.js');

describe('handleGetUncoveredFiles', () => {
  let mockProjectManager: any;
  let mockSonarQubeClient: any;
  let mockValidateInput: any;

  const mockFilesWithCoverageData = {
    totalFiles: 10,
    filesAnalyzed: 8,
    filesWithGaps: 5,
    filesWithoutCoverageData: 2,
    averageCoverage: 45,
    files: [
      {
        key: 'project:src/critical.ts',
        path: 'src/critical.ts',
        name: 'critical.ts',
        language: 'ts',
        coverage: 0,
        uncoveredLines: 150,
        linesToCover: 150,
        hasCoverageData: true,
        priority: 'critical' as const
      },
      {
        key: 'project:src/high.ts',
        path: 'src/high.ts',
        name: 'high.ts',
        language: 'ts',
        coverage: 20,
        uncoveredLines: 120,
        linesToCover: 150,
        hasCoverageData: true,
        priority: 'high' as const
      },
      {
        key: 'project:src/medium.ts',
        path: 'src/medium.ts',
        name: 'medium.ts',
        language: 'ts',
        coverage: 45,
        uncoveredLines: 55,
        linesToCover: 100,
        hasCoverageData: true,
        priority: 'medium' as const
      },
      {
        key: 'project:src/low.ts',
        path: 'src/low.ts',
        name: 'low.ts',
        language: 'ts',
        coverage: 75,
        uncoveredLines: 25,
        linesToCover: 100,
        hasCoverageData: true,
        priority: 'low' as const
      }
    ],
    filesNeedingCoverageSetup: ['src/no-coverage.ts', 'src/another.ts'],
    hasCoverageReport: true
  };

  const mockNoCoverageData = {
    totalFiles: 5,
    filesAnalyzed: 0,
    filesWithGaps: 0,
    filesWithoutCoverageData: 5,
    averageCoverage: 0,
    files: [],
    filesNeedingCoverageSetup: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
    hasCoverageReport: false
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock validateInput
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockImplementation(() => ({
      targetCoverage: 100,
      maxFiles: 50,
      sortBy: 'coverage',
      includeNoCoverageData: false
    }));

    // Mock ProjectManager
    const projectManagerModule = await import('../../universal/project-manager');
    mockProjectManager = {
      getOrCreateConfig: vi.fn(async () => ({
        sonarUrl: 'http://localhost:9000',
        sonarToken: 'test-token',
        sonarProjectKey: 'project'
      })),
      analyzeProject: vi.fn(async () => ({ languages: ['typescript'] }))
    };
    vi.mocked(projectManagerModule.ProjectManager).mockImplementation(function() { return mockProjectManager; });

    // Mock SonarQubeClient
    const sonarModule = await import('../../sonar/index.js');
    mockSonarQubeClient = {
      getFilesWithCoverageGaps: vi.fn(async () => mockFilesWithCoverageData)
    };
    vi.mocked(sonarModule.SonarQubeClient).mockImplementation(function() { return mockSonarQubeClient; });
  });

  describe('Success cases with coverage data', () => {
    it('should validate input and return coverage analysis', async () => {
      const args = {
        targetCoverage: 100,
        maxFiles: 50,
        sortBy: 'coverage'
      };

      const result = await handleGetUncoveredFiles(args);

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.anything(),
        args,
        'sonar_get_uncovered_files'
      );
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Coverage Analysis Results');
    });

    it('should call SonarQube client with validated args', async () => {
      await handleGetUncoveredFiles({});

      expect(mockSonarQubeClient.getFilesWithCoverageGaps).toHaveBeenCalledWith({
        targetCoverage: 100,
        maxFiles: 50,
        sortBy: 'coverage',
        includeNoCoverageData: false
      });
    });

    it('should display files grouped by priority', async () => {
      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('CRITICAL Priority');
      expect(text).toContain('HIGH Priority');
      expect(text).toContain('MEDIUM Priority');
      expect(text).toContain('LOW Priority');
    });

    it('should show file paths and coverage percentages', async () => {
      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('src/critical.ts');
      expect(text).toContain('0%');
      expect(text).toContain('src/high.ts');
      expect(text).toContain('20%');
    });

    it('should show uncovered lines count', async () => {
      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('150 uncovered lines');
      expect(text).toContain('120 uncovered lines');
    });

    it('should show average coverage and files count', async () => {
      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('Average Coverage');
      expect(text).toContain('45%');
      expect(text).toContain('5 of 10');
    });

    it('should include visual coverage bar', async () => {
      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      // Should contain coverage bar characters
      expect(text).toContain('[');
      expect(text).toContain(']');
    });

    it('should show files without coverage data section', async () => {
      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('Files Without Coverage Data');
      expect(text).toContain('src/no-coverage.ts');
    });

    it('should include next step hint', async () => {
      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('sonar_get_coverage_gaps');
    });
  });

  describe('Zero coverage scenarios (CRITICAL)', () => {
    it('should handle project with NO coverage report', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => mockNoCoverageData);

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('No Coverage Data Found');
      expect(text).toContain('doesn\'t have coverage reports');
    });

    it('should provide setup instructions for JavaScript/TypeScript', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => mockNoCoverageData);

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('npm run test:coverage');
      expect(text).toContain('npm test -- --coverage');
    });

    it('should provide setup instructions for Java Maven', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => mockNoCoverageData);

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('mvn test jacoco:report');
    });

    it('should provide setup instructions for Java Gradle', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => mockNoCoverageData);

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('gradle test jacocoTestReport');
    });

    it('should provide setup instructions for Python', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => mockNoCoverageData);

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('pytest --cov');
    });

    it('should provide setup instructions for Go', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => mockNoCoverageData);

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('go test -coverprofile');
    });

    it('should show sample files when no coverage data', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => mockNoCoverageData);

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('Sample Files');
      expect(text).toContain('src/file1.ts');
    });

    it('should show total files count when no coverage', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => mockNoCoverageData);

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('5 source files');
    });

    it('should suggest re-scan after coverage setup', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => mockNoCoverageData);

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('sonar_scan_project');
      expect(text).toContain('Run this tool again');
    });

    it('should handle files with 0% coverage (report exists, no tests)', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => ({
        ...mockFilesWithCoverageData,
        files: [mockFilesWithCoverageData.files[0]], // Only critical file
        filesWithGaps: 1
      }));

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('CRITICAL Priority');
      expect(text).toContain('0% Coverage');
      expect(text).toContain('no test coverage');
    });

    it('should handle mixed scenario: some files with coverage, some without', async () => {
      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      // Has both coverage analysis and files without data
      expect(text).toContain('Coverage Analysis Results');
      expect(text).toContain('Files Without Coverage Data');
    });
  });

  describe('Priority calculation', () => {
    it('should assign critical priority to 0% coverage', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => ({
        ...mockFilesWithCoverageData,
        files: [{
          ...mockFilesWithCoverageData.files[0],
          coverage: 0,
          priority: 'critical'
        }],
        filesWithGaps: 1
      }));

      const result = await handleGetUncoveredFiles({});
      expect(result.content[0].text).toContain('CRITICAL Priority');
    });

    it('should assign high priority to <30% coverage', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => ({
        ...mockFilesWithCoverageData,
        files: [{
          ...mockFilesWithCoverageData.files[1],
          coverage: 25,
          priority: 'high'
        }],
        filesWithGaps: 1
      }));

      const result = await handleGetUncoveredFiles({});
      expect(result.content[0].text).toContain('HIGH Priority');
    });

    it('should assign medium priority to 30-60% coverage', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => ({
        ...mockFilesWithCoverageData,
        files: [{
          ...mockFilesWithCoverageData.files[2],
          coverage: 50,
          priority: 'medium'
        }],
        filesWithGaps: 1
      }));

      const result = await handleGetUncoveredFiles({});
      expect(result.content[0].text).toContain('MEDIUM Priority');
    });

    it('should assign low priority to >60% coverage', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => ({
        ...mockFilesWithCoverageData,
        files: [{
          ...mockFilesWithCoverageData.files[3],
          coverage: 75,
          priority: 'low'
        }],
        filesWithGaps: 1
      }));

      const result = await handleGetUncoveredFiles({});
      expect(result.content[0].text).toContain('LOW Priority');
    });
  });

  describe('Edge cases', () => {
    it('should handle all files meeting target coverage', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => ({
        totalFiles: 10,
        filesAnalyzed: 10,
        filesWithGaps: 0,
        filesWithoutCoverageData: 0,
        averageCoverage: 100,
        files: [],
        filesNeedingCoverageSetup: [],
        hasCoverageReport: true
      }));

      const result = await handleGetUncoveredFiles({});
      const text = result.content[0].text;

      expect(text).toContain('All files meet the target coverage threshold');
    });

    it('should handle empty project (no files)', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => ({
        totalFiles: 0,
        filesAnalyzed: 0,
        filesWithGaps: 0,
        filesWithoutCoverageData: 0,
        averageCoverage: 0,
        files: [],
        filesNeedingCoverageSetup: [],
        hasCoverageReport: false
      }));

      const result = await handleGetUncoveredFiles({});
      expect(result.content[0].text).toContain('No Coverage Data Found');
    });

    it('should handle custom target coverage', async () => {
      mockValidateInput.mockImplementation(() => ({
        targetCoverage: 80,
        maxFiles: 50,
        sortBy: 'coverage',
        includeNoCoverageData: false
      }));

      const result = await handleGetUncoveredFiles({ targetCoverage: 80 });
      expect(result.content[0].text).toContain('80%');
    });

    it('should include files without coverage data when requested', async () => {
      mockValidateInput.mockImplementation(() => ({
        targetCoverage: 100,
        maxFiles: 50,
        sortBy: 'coverage',
        includeNoCoverageData: true
      }));

      await handleGetUncoveredFiles({ includeNoCoverageData: true });

      expect(mockSonarQubeClient.getFilesWithCoverageGaps).toHaveBeenCalledWith(
        expect.objectContaining({ includeNoCoverageData: true })
      );
    });
  });

  describe('Error handling', () => {
    it('should propagate validation errors', async () => {
      mockValidateInput.mockImplementation(() => {
        throw new Error('Invalid target coverage');
      });

      await expect(handleGetUncoveredFiles({})).rejects.toThrow('Invalid target coverage');
    });

    it('should handle SonarQube API errors', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => {
        throw new Error('SonarQube API error');
      });

      await expect(handleGetUncoveredFiles({})).rejects.toThrow('SonarQube API error');
    });

    it('should handle project not found', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => {
        throw new Error("Project 'invalid-key' not found");
      });

      await expect(handleGetUncoveredFiles({})).rejects.toThrow('not found');
    });

    it('should handle network errors', async () => {
      mockSonarQubeClient.getFilesWithCoverageGaps = vi.fn(async () => {
        throw new Error('Network timeout');
      });

      await expect(handleGetUncoveredFiles({})).rejects.toThrow('Network timeout');
    });
  });
});
