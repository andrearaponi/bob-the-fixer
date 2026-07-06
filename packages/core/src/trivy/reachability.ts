/**
 * Reachability heuristic for SCA findings.
 *
 * Pure: classifies a dependency vulnerability as `imported`, `not-imported`, or
 * `unknown` based on whether the vulnerable package (or its entry-point direct
 * dependency) appears in the set of packages the project's source actually
 * imports. This is an import-presence heuristic — not call-graph reachability
 * of the vulnerable function.
 */

import { IIssue } from '../scanners/IIssue.js';

export type Reachability = 'imported' | 'not-imported' | 'unknown';

/** Strip the trailing `@version` from a `name@version` label, keeping any scope. */
function packageNameOf(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const at = label.lastIndexOf('@');
  return at > 0 ? label.slice(0, at) : label;
}

/**
 * Classify a dependency vulnerability's reachability. Pure; never throws.
 * Only npm-ecosystem findings are classified (import scanning is JS/TS only);
 * everything else — and the absence of import data — is `unknown`.
 */
export function classifyReachability(
  dep: IIssue['dependency'],
  imported: Set<string>
): Reachability {
  if (!dep || dep.ecosystem !== 'npm') return 'unknown';
  if (imported.size === 0) return 'unknown';

  const names = [dep.packageName, packageNameOf(dep.directDependency)].filter(
    (n): n is string => !!n
  );
  if (names.some((n) => imported.has(n))) return 'imported';
  return 'not-imported';
}
