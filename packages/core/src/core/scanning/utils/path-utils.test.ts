import { describe, it, expect } from 'vitest';
import {
  processLibraryPaths,
  makeRelativeIfPossible,
  isUnderProject,
  countLibraries,
  summarizeLibraries,
  LibraryPathStrategy
} from './path-utils.js';
import * as path from 'path';

describe('path-utils', () => {
  const projectPath = '/Users/test/my-project';

  describe('processLibraryPaths', () => {
    it('should return undefined for undefined input', () => {
      expect(processLibraryPaths(undefined, projectPath, 'relative')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(processLibraryPaths('', projectPath, 'relative')).toBeUndefined();
    });

    it('should keep absolute paths with absolute strategy', () => {
      const libs = '/Users/test/.m2/repository/lib.jar,/Users/test/.m2/repository/other.jar';
      expect(processLibraryPaths(libs, projectPath, 'absolute')).toBe(libs);
    });

    it('should convert project-local paths to relative with relative strategy', () => {
      const libs = '/Users/test/my-project/lib/local.jar';
      const result = processLibraryPaths(libs, projectPath, 'relative');
      expect(result).toBe('lib/local.jar');
    });

    it('should keep external paths as-is with relative strategy', () => {
      const libs = '/Users/test/.m2/repository/external.jar';
      const result = processLibraryPaths(libs, projectPath, 'relative');
      expect(result).toBe(libs);
    });

    it('should handle mixed paths with relative strategy', () => {
      const libs = '/Users/test/my-project/lib/local.jar,/Users/test/.m2/repository/external.jar';
      const result = processLibraryPaths(libs, projectPath, 'relative');
      expect(result).toContain('lib/local.jar');
      expect(result).toContain('/Users/test/.m2/repository/external.jar');
    });

    it('should convert to glob patterns with glob strategy', () => {
      const libs = '/Users/test/.m2/repository/org/springframework/spring-core.jar';
      const result = processLibraryPaths(libs, projectPath, 'glob');
      expect(result).toContain('${user.home}/.m2/repository/**/*.jar');
    });

    it('should handle gradle cache paths with glob strategy', () => {
      const libs = '/Users/test/.gradle/caches/modules-2/files-2.1/lib.jar';
      const result = processLibraryPaths(libs, projectPath, 'glob');
      expect(result).toContain('${user.home}/.gradle/caches/**/*.jar');
    });

    it('should handle project lib directories with glob strategy', () => {
      const libs = '/Users/test/my-project/lib/commons-lang.jar';
      const result = processLibraryPaths(libs, projectPath, 'glob');
      expect(result).toContain('**/lib/**/*.jar');
    });
  });

  describe('makeRelativeIfPossible', () => {
    it('should make path relative when under project', () => {
      const absolutePath = '/Users/test/my-project/target/classes';
      expect(makeRelativeIfPossible(absolutePath, projectPath)).toBe('target/classes');
    });

    it('should keep path absolute when outside project', () => {
      const absolutePath = '/Users/test/.m2/repository/lib.jar';
      expect(makeRelativeIfPossible(absolutePath, projectPath)).toBe(absolutePath);
    });

    it('should handle nested paths correctly', () => {
      const absolutePath = '/Users/test/my-project/src/main/java/App.java';
      expect(makeRelativeIfPossible(absolutePath, projectPath)).toBe('src/main/java/App.java');
    });
  });

  describe('isUnderProject', () => {
    it('should return true for paths under project', () => {
      expect(isUnderProject('/Users/test/my-project/src', projectPath)).toBe(true);
      expect(isUnderProject('/Users/test/my-project/lib/file.jar', projectPath)).toBe(true);
    });

    it('should return false for paths outside project', () => {
      expect(isUnderProject('/Users/test/.m2/repository', projectPath)).toBe(false);
      expect(isUnderProject('/Users/test/other-project', projectPath)).toBe(false);
    });

    it('should return false for the project path itself', () => {
      expect(isUnderProject(projectPath, projectPath)).toBe(false);
    });

    it('should handle similar path prefixes correctly', () => {
      // /Users/test/my-project-2 should not be considered under /Users/test/my-project
      expect(isUnderProject('/Users/test/my-project-2/src', projectPath)).toBe(false);
    });
  });

  describe('countLibraries', () => {
    it('should return 0 for undefined', () => {
      expect(countLibraries(undefined)).toBe(0);
    });

    it('should return 0 for empty string', () => {
      expect(countLibraries('')).toBe(0);
    });

    it('should count single library', () => {
      expect(countLibraries('/path/to/lib.jar')).toBe(1);
    });

    it('should count multiple libraries', () => {
      expect(countLibraries('/path/a.jar,/path/b.jar,/path/c.jar')).toBe(3);
    });

    it('should ignore empty entries', () => {
      expect(countLibraries('/path/a.jar,,/path/b.jar,')).toBe(2);
    });
  });

  describe('summarizeLibraries', () => {
    it('should return "none" for undefined', () => {
      expect(summarizeLibraries(undefined)).toBe('none');
    });

    it('should return "none" for empty string', () => {
      expect(summarizeLibraries('')).toBe('none');
    });

    it('should display all libraries when under max', () => {
      const libs = '/path/a.jar,/path/b.jar';
      const result = summarizeLibraries(libs, 3);
      expect(result).toBe('a.jar, b.jar');
    });

    it('should truncate when over max', () => {
      const libs = '/path/a.jar,/path/b.jar,/path/c.jar,/path/d.jar,/path/e.jar';
      const result = summarizeLibraries(libs, 2);
      expect(result).toBe('a.jar, b.jar... (+3 more)');
    });

    it('should use default max of 3', () => {
      const libs = '/path/a.jar,/path/b.jar,/path/c.jar,/path/d.jar';
      const result = summarizeLibraries(libs);
      expect(result).toBe('a.jar, b.jar, c.jar... (+1 more)');
    });
  });
});
