import { describe, it, expect, beforeAll } from 'vitest';
import { SonarQubeClient } from '../../../src/sonar/client.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const enabled = process.env.SONAR_E2E === '1';
const describeIf = enabled ? describe : describe.skip;

type IndexResponse = Record<string, unknown> | Array<Record<string, unknown>>;

function parseSourcesIndex(data: IndexResponse, from: number, toInclusive: number): Array<{ line: number; code: string }> {
  const out: Array<{ line: number; code: string }> = [];
  const safeFrom = Math.max(1, from);
  const safeTo = Math.max(safeFrom, toInclusive);

  const collect = (obj: Record<string, unknown>) => {
    for (const [lineStr, codeVal] of Object.entries(obj)) {
      const line = Number(lineStr);
      if (!Number.isFinite(line)) continue;
      if (line < safeFrom || line > safeTo) continue;
      out.push({ line, code: typeof codeVal === 'string' ? codeVal : '' });
    }
  };

  if (Array.isArray(data)) {
    for (const block of data) {
      if (!block || typeof block !== 'object') continue;
      collect(block);
    }
  } else if (data && typeof data === 'object') {
    collect(data);
  }

  out.sort((a, b) => a.line - b.line);
  return out;
}

describeIf('SonarQube API Contract (E2E)', () => {
  const sonarUrl = process.env.SONAR_E2E_URL ?? 'http://localhost:9001';
  const sonarToken = process.env.SONAR_E2E_TOKEN;
  const projectKey = process.env.SONAR_E2E_PROJECT_KEY ?? 'demo-bob-e2e';
  const componentKey =
    process.env.SONAR_E2E_COMPONENT_KEY ?? `${projectKey}:src/main/java/com/demo/bob/PersonService.java`;

  const fixtureDir =
    process.env.SONAR_E2E_FIXTURE_DIR ?? path.join(__dirname, '.work', 'demo-bob-java');
  const fixtureFile = path.join(fixtureDir, 'src/main/java/com/demo/bob/PersonService.java');

  let client: SonarQubeClient;

  beforeAll(async () => {
    if (!sonarToken) {
      throw new Error('Missing SONAR_E2E_TOKEN. Run scripts/bootstrap.sh and source the generated .work/.env file.');
    }

    try {
      await fs.access(fixtureFile);
    } catch {
      throw new Error(
        `Fixture file not found at ${fixtureFile}. Run tests/e2e/sonar-contract/scripts/bootstrap.sh first.`
      );
    }

    client = new SonarQubeClient(sonarUrl, sonarToken, projectKey);
  });

  it('api/sources/index is plain text and `to` is exclusive', { timeout: 60_000 }, async () => {
    const response = await client.client.get('/api/sources/index', {
      params: { resource: componentKey, from: 1, to: 3 }
    });

    const lines = parseSourcesIndex(response.data as IndexResponse, 1, 10);
    expect(lines.map(l => l.line)).toEqual([1, 2]); // `to=3` is exclusive → returns 1..2
    expect(lines.some(l => l.code.includes('<span'))).toBe(false);
  });

  it('api/sources/lines `code` contains HTML syntax highlighting (contract)', { timeout: 60_000 }, async () => {
    const response = await client.client.get('/api/sources/lines', {
      params: { key: componentKey, from: 1, to: 2 }
    });

    const code = response.data?.sources?.[0]?.code ?? '';
    expect(String(code)).toContain('<span');
  });

  it('SonarQubeClient.getSourceLines returns plain text matching the analyzed file', { timeout: 60_000 }, async () => {
    const expected = (await fs.readFile(fixtureFile, 'utf8')).split('\n').slice(0, 40);
    const actual = await client.getSourceLines(componentKey, 1, 40);

    expect(actual.map(l => l.code ?? '')).toEqual(expected);
    expect(actual.some(l => (l.code ?? '').includes('<span'))).toBe(false);
  });

  it('SonarQubeClient.getSourceContext returns the expected number of lines', { timeout: 60_000 }, async () => {
    const context = await client.getSourceContext(componentKey, 10, 2); // 10 ±2 → 5 lines (unless file shorter)
    const lines = context ? context.split('\n') : [];
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(5);
    expect(lines.some(l => l.includes('<span'))).toBe(false);
  });

  it('Project has both OPEN and FIXED issues for java:S1854 (for similar-fixed feature)', { timeout: 60_000 }, async () => {
    const open = await client.getIssues({ rules: ['java:S1854'] });
    expect(open.length).toBeGreaterThan(0);

    const fixed = await client.getSimilarFixedIssues('java:S1854', 10);
    expect(fixed.length).toBeGreaterThan(0);

    const openKeys = new Set(open.map(i => i.key));
    expect(fixed.some(i => !openKeys.has(i.key))).toBe(true);
  });
});
