import { describe, it, expect } from 'vitest';
import { classifyReachability } from './reachability.js';

const imported = new Set(['express', '@modelcontextprotocol/sdk']);

describe('classifyReachability', () => {
  it('R2.AC1: imported when the vulnerable package itself is imported', () => {
    const dep = { packageName: 'express', installedVersion: '5', ecosystem: 'npm' };
    expect(classifyReachability(dep as any, imported)).toBe('imported');
  });

  it('R2.AC1: imported when the entry-point direct dependency is imported (package is not)', () => {
    const dep = {
      packageName: 'qs',
      installedVersion: '6',
      ecosystem: 'npm',
      directDependency: 'express@5.2.1',
    };
    expect(classifyReachability(dep as any, imported)).toBe('imported');
  });

  it('R2.AC1: strips scope+version from the direct dependency label', () => {
    const dep = {
      packageName: 'hono',
      installedVersion: '4',
      ecosystem: 'npm',
      directDependency: '@modelcontextprotocol/sdk@1.29.0',
    };
    expect(classifyReachability(dep as any, imported)).toBe('imported');
  });

  it('R2.AC2: not-imported when neither the package nor its direct dep is imported', () => {
    const dep = {
      packageName: 'left-pad',
      installedVersion: '1',
      ecosystem: 'npm',
      directDependency: 'some-dead-dep@1.0.0',
    };
    expect(classifyReachability(dep as any, imported)).toBe('not-imported');
  });

  it('R2.AC3: unknown for a non-npm ecosystem', () => {
    const dep = { packageName: 'ch.qos.logback:logback-classic', installedVersion: '1.2.12', ecosystem: 'pom' };
    expect(classifyReachability(dep as any, imported)).toBe('unknown');
  });

  it('unknown when there is no import data', () => {
    const dep = { packageName: 'express', installedVersion: '5', ecosystem: 'npm' };
    expect(classifyReachability(dep as any, new Set())).toBe('unknown');
  });
});
