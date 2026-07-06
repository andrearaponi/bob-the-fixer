import { describe, it, expect } from 'vitest';
import { DependencyGraph, TrivyPackage } from './dependency-graph.js';

const pkgs: TrivyPackage[] = [
  { ID: 'root@1', Name: 'app', Version: '1', Relationship: 'root', DependsOn: ['express@4', 'lodash@4'] },
  { ID: 'express@4', Name: 'express', Version: '4', Relationship: 'direct', DependsOn: ['body-parser@1'] },
  { ID: 'body-parser@1', Name: 'body-parser', Version: '1', Relationship: 'indirect', DependsOn: ['qs@6'] },
  { ID: 'qs@6', Name: 'qs', Version: '6', Relationship: 'indirect', DependsOn: [] },
  { ID: 'lodash@4', Name: 'lodash', Version: '4', Relationship: 'direct', DependsOn: [] },
];

describe('DependencyGraph', () => {
  const g = new DependencyGraph(pkgs);

  it('R2.AC2: a direct dependency has a single-element path', () => {
    const r = g.pathTo('lodash@4');
    expect(r.relationship).toBe('direct');
    expect(r.path).toEqual(['lodash@4']);
    expect(r.directDependency).toBe('lodash@4');
  });

  it('R2.AC1/R2.AC3: a transitive package traces to its direct entry point', () => {
    const r = g.pathTo('qs@6');
    expect(r.relationship).toBe('indirect');
    expect(r.path).toEqual(['express@4', 'body-parser@1', 'qs@6']);
    expect(r.directDependency).toBe('express@4');
  });

  it('R2.AC4: an unknown package id is marked unknown, not a crash', () => {
    const r = g.pathTo('ghost@9');
    expect(r.relationship).toBe('unknown');
    expect(r.path).toEqual(['ghost@9']);
  });

  it('NFR3: a cyclic graph terminates and still finds the path', () => {
    const cyc: TrivyPackage[] = [
      { ID: 'a@1', Name: 'a', Version: '1', Relationship: 'direct', DependsOn: ['b@1'] },
      { ID: 'b@1', Name: 'b', Version: '1', Relationship: 'indirect', DependsOn: ['a@1', 'c@1'] }, // a<->b cycle
      { ID: 'c@1', Name: 'c', Version: '1', Relationship: 'indirect', DependsOn: [] },
    ];
    const r = new DependencyGraph(cyc).pathTo('c@1');
    expect(r.path).toEqual(['a@1', 'b@1', 'c@1']);
    expect(r.relationship).toBe('indirect');
  });

  it('R2.AC1: picks the shortest path when reachable from two directs', () => {
    const multi: TrivyPackage[] = [
      { ID: 'root@1', Name: 'app', Version: '1', Relationship: 'root', DependsOn: ['x@1', 'y@1'] },
      { ID: 'x@1', Name: 'x', Version: '1', Relationship: 'direct', DependsOn: ['mid@1'] },
      { ID: 'y@1', Name: 'y', Version: '1', Relationship: 'direct', DependsOn: ['target@1'] }, // 1 hop
      { ID: 'mid@1', Name: 'mid', Version: '1', Relationship: 'indirect', DependsOn: ['target@1'] },
      { ID: 'target@1', Name: 'target', Version: '1', Relationship: 'indirect', DependsOn: [] },
    ];
    const r = new DependencyGraph(multi).pathTo('target@1');
    expect(r.path).toEqual(['y@1', 'target@1']);
    expect(r.directDependency).toBe('y@1');
  });

  it('workspace: a project package Trivy labels "direct" is not the dependency to bump', () => {
    // In a monorepo Trivy marks the workspace package "direct" (nothing depends
    // on it); the real dependency is its child, labeled "indirect".
    const ws: TrivyPackage[] = [
      { ID: 'core@1', Name: '@scope/core', Version: '1', Relationship: 'direct', DependsOn: ['sdk@1'] },
      { ID: 'sdk@1', Name: 'sdk', Version: '1', Relationship: 'indirect', DependsOn: ['hono@1'] },
      { ID: 'hono@1', Name: 'hono', Version: '1', Relationship: 'indirect', DependsOn: [] },
    ];
    const r = new DependencyGraph(ws).pathTo('hono@1');
    expect(r.path).toEqual(['@scope/core@1', 'sdk@1', 'hono@1']);
    expect(r.directDependency).toBe('sdk@1'); // the real dep, NOT @scope/core
  });
});
