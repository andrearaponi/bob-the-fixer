/**
 * Dependency graph over Trivy's package list.
 *
 * Pure (no I/O): given the packages Trivy reports for a target (each with a
 * Relationship and DependsOn edges), computes the shortest path from a direct
 * or root dependency down to a given (typically transitive) package. Used to
 * enrich SCA findings with "which of my direct deps pulls in this vulnerable
 * package, and through what chain".
 */

/** Subset of a Trivy `Results[].Packages[]` entry we rely on. */
export interface TrivyPackage {
  ID: string;
  Name?: string;
  Version?: string;
  Relationship?: string; // 'root' | 'direct' | 'indirect' (others ignored)
  DependsOn?: string[];
}

export type PackageRelationship = 'direct' | 'indirect' | 'root' | 'unknown';

export interface DependencyPath {
  /** Chain of `name@version` labels from a direct/root dep to the target. */
  path: string[];
  /** Entry-point direct dependency label (first non-root node), if determined. */
  directDependency?: string;
  /** Relationship of the target package (or 'unknown' if not resolvable). */
  relationship: PackageRelationship;
}

export class DependencyGraph {
  private readonly byId = new Map<string, TrivyPackage>();
  private readonly sources: string[] = []; // direct + root package IDs

  constructor(packages: TrivyPackage[]) {
    for (const pkg of packages) {
      if (pkg?.ID) this.byId.set(pkg.ID, pkg);
    }
    for (const pkg of this.byId.values()) {
      if (pkg.Relationship === 'direct' || pkg.Relationship === 'root') {
        this.sources.push(pkg.ID);
      }
    }
  }

  private label(id: string): string {
    const pkg = this.byId.get(id);
    if (!pkg) return id;
    if (pkg.Name && pkg.Version) return `${pkg.Name}@${pkg.Version}`;
    return pkg.Name ?? pkg.ID;
  }

  /**
   * Resolve the dependency path to the given package id. Never throws.
   */
  pathTo(pkgId: string): DependencyPath {
    const target = this.byId.get(pkgId);
    if (!target) {
      return { path: [pkgId], relationship: 'unknown' };
    }

    if (target.Relationship === 'direct') {
      const label = this.label(pkgId);
      return { path: [label], directDependency: label, relationship: 'direct' };
    }
    if (target.Relationship === 'root') {
      return { path: [this.label(pkgId)], relationship: 'root' };
    }

    // Indirect (or unspecified relationship): trace it back to a source.
    const idPath = this.shortestPath(pkgId);
    if (!idPath) {
      return { path: [this.label(pkgId)], relationship: 'unknown' };
    }
    const firstNonRoot = idPath.find((id) => this.byId.get(id)?.Relationship !== 'root');
    return {
      path: idPath.map((id) => this.label(id)),
      directDependency: firstNonRoot ? this.label(firstNonRoot) : undefined,
      relationship: 'indirect',
    };
  }

  /** BFS from all sources over DependsOn; shortest id-path to target or null. */
  private shortestPath(targetId: string): string[] | null {
    const visited = new Set<string>(this.sources);
    const queue: string[][] = this.sources.map((id) => [id]);

    while (queue.length > 0) {
      const path = queue.shift() as string[];
      const last = path[path.length - 1];
      if (last === targetId) return path;
      for (const dep of this.byId.get(last)?.DependsOn ?? []) {
        if (!this.byId.has(dep) || visited.has(dep)) continue;
        visited.add(dep);
        queue.push([...path, dep]);
      }
    }
    return null;
  }
}
