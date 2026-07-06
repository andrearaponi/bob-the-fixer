/**
 * Source import scanner.
 *
 * Walks a project's JS/TS source and collects the set of package names it
 * imports/requires, for the reachability heuristic. Best-effort: skips
 * node_modules and build output, bounds traversal, and never throws.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.next', 'out']);
const MAX_FILES = 5000;

// Captures the specifier in: `… from 'X'`, `require('X')`, `import('X')`, `import 'X'`.
const IMPORT_RE = /(?:from|require\s*\(|import\s*\(|import)\s*['"]([^'"]+)['"]/g;

/** Normalize an import specifier to a package name, or null if it is not a package. */
function packageOf(spec: string): string | null {
  if (!spec || spec.startsWith('.') || spec.startsWith('/')) return null; // relative/absolute
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return spec.split('/')[0];
}

/**
 * Collect the set of package names imported by the project's JS/TS source.
 * Never throws; unreadable dirs/files are skipped.
 */
export async function collectImportedPackages(projectPath: string): Promise<Set<string>> {
  const found = new Set<string>();
  let budget = MAX_FILES;

  async function walk(dir: string): Promise<void> {
    if (budget <= 0) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory → skip
    }
    for (const entry of entries) {
      if (budget <= 0) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await walk(full);
      } else if (entry.isFile() && SOURCE_EXT.has(path.extname(entry.name))) {
        budget--;
        try {
          const content = await fs.readFile(full, 'utf8');
          for (const m of content.matchAll(IMPORT_RE)) {
            const pkg = packageOf(m[1]);
            if (pkg) found.add(pkg);
          }
        } catch {
          // unreadable file → skip
        }
      }
    }
  }

  await walk(projectPath);
  return found;
}
