/**
 * Path processing utilities for SonarQube configuration
 * Handles library path conversion strategies for cross-machine portability
 */
import * as path from 'path';

/**
 * Strategy for handling library paths
 */
export type LibraryPathStrategy = 'absolute' | 'relative' | 'glob';

/**
 * Process library paths according to strategy
 * @param librariesString Comma-separated library paths (may be undefined)
 * @param projectPath Project root directory
 * @param strategy How to process paths
 * @returns Processed library paths string, or undefined if input was undefined
 */
export function processLibraryPaths(
  librariesString: string | undefined,
  projectPath: string,
  strategy: LibraryPathStrategy
): string | undefined {
  if (!librariesString) {
    return undefined;
  }

  if (strategy === 'absolute') {
    return librariesString;
  }

  const libraries = librariesString.split(',').map(lib => lib.trim()).filter(Boolean);

  if (libraries.length === 0) {
    return undefined;
  }

  if (strategy === 'glob') {
    return convertToGlobPatterns(libraries, projectPath);
  }

  // strategy === 'relative'
  return libraries.map(lib => makeRelativeIfPossible(lib, projectPath)).join(',');
}

/**
 * Make an absolute path relative to project if it's under the project directory
 * Paths outside the project (e.g., ~/.m2) are kept as-is
 */
export function makeRelativeIfPossible(absolutePath: string, projectPath: string): string {
  const normalizedFile = path.normalize(absolutePath);
  const normalizedProject = path.normalize(projectPath);

  // If path is under project directory, make it relative
  if (normalizedFile.startsWith(normalizedProject + path.sep)) {
    return path.relative(projectPath, normalizedFile);
  }

  // For paths outside project (like ~/.m2), keep as-is
  return absolutePath;
}

/**
 * Check if a path is under the project directory
 */
export function isUnderProject(filePath: string, projectPath: string): boolean {
  const normalizedFile = path.normalize(filePath);
  const normalizedProject = path.normalize(projectPath);
  return normalizedFile.startsWith(normalizedProject + path.sep);
}

/**
 * Convert library paths to glob patterns for maximum portability
 * Useful when the properties file needs to work across different machines
 */
function convertToGlobPatterns(libraries: string[], projectPath: string): string {
  const patterns: Set<string> = new Set();

  for (const lib of libraries) {
    // Check for Maven repository paths
    if (lib.includes('.m2/repository') || lib.includes('.m2' + path.sep + 'repository')) {
      patterns.add('${user.home}/.m2/repository/**/*.jar');
      continue;
    }

    // Check for Gradle cache paths
    if (lib.includes('.gradle/caches') || lib.includes('.gradle' + path.sep + 'caches')) {
      patterns.add('${user.home}/.gradle/caches/**/*.jar');
      continue;
    }

    // Check for project-local lib directories
    if (isUnderProject(lib, projectPath)) {
      const relativePath = path.relative(projectPath, lib);
      const dir = path.dirname(relativePath);

      // Common library directory patterns
      if (dir.includes('lib') || dir.includes('libs')) {
        patterns.add('**/lib/**/*.jar');
      } else if (dir.includes('target') || dir.includes('build')) {
        // Keep these as relative paths (build artifacts)
        patterns.add(relativePath);
      } else {
        // Generic pattern for other project jars
        patterns.add(relativePath);
      }
      continue;
    }

    // Unknown external path - keep as-is
    patterns.add(lib);
  }

  return Array.from(patterns).join(',');
}

/**
 * Count the number of libraries in a comma-separated string
 */
export function countLibraries(librariesString: string | undefined): number {
  if (!librariesString) {
    return 0;
  }
  return librariesString.split(',').filter(lib => lib.trim()).length;
}

/**
 * Summarize library paths for display (truncate if too many)
 */
export function summarizeLibraries(librariesString: string | undefined, maxDisplay: number = 3): string {
  if (!librariesString) {
    return 'none';
  }

  const libraries = librariesString.split(',').map(lib => lib.trim()).filter(Boolean);
  const total = libraries.length;

  if (total === 0) {
    return 'none';
  }

  if (total <= maxDisplay) {
    return libraries.map(lib => path.basename(lib)).join(', ');
  }

  const displayed = libraries.slice(0, maxDisplay).map(lib => path.basename(lib));
  return `${displayed.join(', ')}... (+${total - maxDisplay} more)`;
}
