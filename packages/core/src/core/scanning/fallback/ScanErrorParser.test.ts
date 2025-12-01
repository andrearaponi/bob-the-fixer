import { describe, it, expect } from 'vitest';
import { ScanErrorParser } from './ScanErrorParser';
import { ScanErrorCategory } from '../../../shared/types/index.js';

describe('ScanErrorParser', () => {
  let parser: ScanErrorParser;

  beforeEach(() => {
    parser = new ScanErrorParser();
  });

  describe('parse', () => {
    describe('SOURCES_NOT_FOUND', () => {
      it('should detect "Unable to find source files" error', () => {
        const result = parser.parse('Unable to find source files in /project/src');

        expect(result.category).toBe(ScanErrorCategory.SOURCES_NOT_FOUND);
        expect(result.missingParameters).toContain('sonar.sources');
      });

      it('should detect "No sources found" error', () => {
        const result = parser.parse('No sources found for analysis');

        expect(result.category).toBe(ScanErrorCategory.SOURCES_NOT_FOUND);
      });

      it('should detect "sonar.sources does not exist" error', () => {
        const result = parser.parse('Property sonar.sources path does not exist');

        expect(result.category).toBe(ScanErrorCategory.SOURCES_NOT_FOUND);
      });
    });

    describe('BINARY_PATH_MISSING', () => {
      it('should detect missing Java binaries error', () => {
        const result = parser.parse('Unable to find classes directory');

        expect(result.category).toBe(ScanErrorCategory.BINARY_PATH_MISSING);
        expect(result.missingParameters).toContain('sonar.java.binaries');
      });

      it('should detect "sonar.java.binaries does not exist" error', () => {
        const result = parser.parse('sonar.java.binaries path does not exist: /target/classes');

        expect(result.category).toBe(ScanErrorCategory.BINARY_PATH_MISSING);
      });

      it('should detect Java project without binaries error', () => {
        const result = parser.parse('Your project contains Java files but sonar.java.binaries is not set');

        expect(result.category).toBe(ScanErrorCategory.BINARY_PATH_MISSING);
      });
    });

    describe('MODULE_CONFIG_ERROR', () => {
      it('should detect module not found error', () => {
        const result = parser.parse('Module "backend" not found in project');

        expect(result.category).toBe(ScanErrorCategory.MODULE_CONFIG_ERROR);
        expect(result.missingParameters).toContain('sonar.modules');
      });

      it('should detect invalid module configuration', () => {
        const result = parser.parse('Invalid module configuration for project');

        expect(result.category).toBe(ScanErrorCategory.MODULE_CONFIG_ERROR);
      });

      it('should extract module name from error', () => {
        const result = parser.parse('Module: "api-service" not found');

        expect(result.category).toBe(ScanErrorCategory.MODULE_CONFIG_ERROR);
        expect(result.affectedPaths).toContain('api-service');
      });
    });

    describe('EXCLUSION_PATTERN_ERROR', () => {
      it('should detect invalid exclusion pattern', () => {
        const result = parser.parse('Invalid exclusion pattern: **/*.tmp[');

        expect(result.category).toBe(ScanErrorCategory.EXCLUSION_PATTERN_ERROR);
        expect(result.missingParameters).toContain('sonar.exclusions');
      });

      it('should detect pattern syntax error', () => {
        const result = parser.parse('Pattern "***/*.js" is not valid');

        expect(result.category).toBe(ScanErrorCategory.EXCLUSION_PATTERN_ERROR);
      });
    });

    describe('LANGUAGE_NOT_DETECTED', () => {
      it('should detect no files matching error', () => {
        const result = parser.parse('No files nor directories matching the pattern');

        expect(result.category).toBe(ScanErrorCategory.LANGUAGE_NOT_DETECTED);
        expect(result.missingParameters).toContain('sonar.language');
        expect(result.missingParameters).toContain('sonar.sources');
      });

      it('should detect no analyzable files error', () => {
        const result = parser.parse('No analyzable files in the project');

        expect(result.category).toBe(ScanErrorCategory.LANGUAGE_NOT_DETECTED);
      });
    });

    describe('PERMISSION_DENIED', () => {
      it('should detect 403 error', () => {
        const result = parser.parse('Request failed with status 403');

        expect(result.category).toBe(ScanErrorCategory.PERMISSION_DENIED);
        expect(result.suggestedFix).toContain('token permissions');
      });

      it('should detect permission denied error', () => {
        const result = parser.parse('Permission denied to access the project');

        expect(result.category).toBe(ScanErrorCategory.PERMISSION_DENIED);
      });

      it('should detect access denied error', () => {
        const result = parser.parse('Access denied: insufficient privileges');

        expect(result.category).toBe(ScanErrorCategory.PERMISSION_DENIED);
      });
    });

    describe('SCANNER_NOT_FOUND', () => {
      it('should detect sonar-scanner not found', () => {
        const result = parser.parse('sonar-scanner: command not found');

        expect(result.category).toBe(ScanErrorCategory.SCANNER_NOT_FOUND);
        expect(result.suggestedFix).toContain('Install');
      });

      it('should detect command not found error', () => {
        const result = parser.parse('command not found: sonar-scanner');

        expect(result.category).toBe(ScanErrorCategory.SCANNER_NOT_FOUND);
      });
    });

    describe('UNKNOWN', () => {
      it('should categorize unknown errors', () => {
        const result = parser.parse('Some random error message');

        expect(result.category).toBe(ScanErrorCategory.UNKNOWN);
        expect(result.rawMessage).toBe('Some random error message');
      });
    });
  });

  describe('isRecoverable', () => {
    it('should return true for SOURCES_NOT_FOUND', () => {
      const error = parser.parse('No sources found');
      expect(parser.isRecoverable(error)).toBe(true);
    });

    it('should return true for MODULE_CONFIG_ERROR', () => {
      const error = parser.parse('Module not found');
      expect(parser.isRecoverable(error)).toBe(true);
    });

    it('should return true for BINARY_PATH_MISSING', () => {
      const error = parser.parse('Unable to find classes');
      expect(parser.isRecoverable(error)).toBe(true);
    });

    it('should return true for EXCLUSION_PATTERN_ERROR', () => {
      const error = parser.parse('Invalid exclusion pattern');
      expect(parser.isRecoverable(error)).toBe(true);
    });

    it('should return true for LANGUAGE_NOT_DETECTED', () => {
      const error = parser.parse('No analyzable files');
      expect(parser.isRecoverable(error)).toBe(true);
    });

    it('should return false for PERMISSION_DENIED', () => {
      const error = parser.parse('Permission denied');
      expect(parser.isRecoverable(error)).toBe(false);
    });

    it('should return false for SCANNER_NOT_FOUND', () => {
      const error = parser.parse('sonar-scanner not found');
      expect(parser.isRecoverable(error)).toBe(false);
    });

    it('should return false for UNKNOWN', () => {
      const error = parser.parse('Random error');
      expect(parser.isRecoverable(error)).toBe(false);
    });
  });

  describe('extractPaths', () => {
    it('should extract quoted Unix paths', () => {
      const paths = parser.extractPaths('Error at "/home/user/project/src"');

      expect(paths).toContain('/home/user/project/src');
    });

    it('should extract absolute Unix paths', () => {
      const paths = parser.extractPaths('Unable to read /var/lib/sonar/cache');

      expect(paths).toContain('/var/lib/sonar/cache');
    });

    it('should extract Windows paths', () => {
      const paths = parser.extractPaths('Error at C:\\Users\\dev\\project');

      expect(paths).toContain('C:\\Users\\dev\\project');
    });

    it('should deduplicate paths', () => {
      const paths = parser.extractPaths('Error at "/project/src" and also "/project/src"');

      const srcPaths = paths.filter(p => p === '/project/src');
      expect(srcPaths.length).toBe(1);
    });

    it('should return empty array when no paths found', () => {
      const paths = parser.extractPaths('No paths here');

      expect(paths).toEqual([]);
    });
  });

  describe('getRecoveryRecommendation', () => {
    it('should return recommendation for SOURCES_NOT_FOUND', () => {
      const error = parser.parse('No sources found');
      const recommendation = parser.getRecoveryRecommendation(error);

      expect(recommendation).toContain('sonar_generate_config');
      expect(recommendation).toContain('source paths');
    });

    it('should return recommendation for MODULE_CONFIG_ERROR', () => {
      const error = parser.parse('Module not found');
      const recommendation = parser.getRecoveryRecommendation(error);

      expect(recommendation).toContain('sonar_generate_config');
      expect(recommendation).toContain('multi-module');
    });

    it('should return recommendation for BINARY_PATH_MISSING', () => {
      const error = parser.parse('Unable to find classes');
      const recommendation = parser.getRecoveryRecommendation(error);

      expect(recommendation).toContain('Build');
      expect(recommendation).toContain('javaBinaries');
    });

    it('should return recommendation for PERMISSION_DENIED', () => {
      const error = parser.parse('Permission denied');
      const recommendation = parser.getRecoveryRecommendation(error);

      expect(recommendation).toContain('sonar_auto_setup');
    });

    it('should return recommendation for SCANNER_NOT_FOUND', () => {
      const error = parser.parse('sonar-scanner not found');
      const recommendation = parser.getRecoveryRecommendation(error);

      expect(recommendation).toContain('Install');
    });

    it('should return recommendation for UNKNOWN', () => {
      const error = parser.parse('Random error');
      const recommendation = parser.getRecoveryRecommendation(error);

      expect(recommendation).toContain('sonar_generate_config');
    });
  });
});
