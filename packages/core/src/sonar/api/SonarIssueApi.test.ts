import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarIssueApi } from './SonarIssueApi.js';

describe('SonarIssueApi', () => {
  let get: ReturnType<typeof vi.fn>;
  let api: SonarIssueApi;

  beforeEach(() => {
    get = vi.fn();
    api = new SonarIssueApi({ get } as any, 'my-project');
  });

  it('R2.AC1: getIssues queries the project key and returns the issues', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/api/issues/search') return { data: { total: 2, issues: [{ key: 'A' }, { key: 'B' }] } };
      return { data: { components: [] } }; // /api/projects/search analysis-date lookup
    });

    const issues = await api.getIssues();

    expect(get).toHaveBeenCalledWith(
      '/api/issues/search',
      expect.objectContaining({ params: expect.objectContaining({ componentKeys: 'my-project' }) })
    );
    expect(issues).toHaveLength(2);
  });

  it('R2.AC2: getIssues caps pagination at the 10k window', async () => {
    const page = Array.from({ length: 500 }, (_, i) => ({ key: `I${i}` }));
    const requestedPages: number[] = [];
    get.mockImplementation(async (url: string, cfg?: any) => {
      if (url === '/api/issues/search') {
        requestedPages.push(cfg?.params?.p);
        return { data: { total: 15000, issues: page } };
      }
      return { data: { components: [] } };
    });

    const issues = await api.getIssues();

    expect(Math.max(...requestedPages)).toBeLessThanOrEqual(20);
    expect(issues.length).toBe(20 * 500);
  });

  it('R2.AC1: getIssueByKey returns the matching issue or null', async () => {
    get.mockResolvedValueOnce({ data: { issues: [{ key: 'ISSUE-1' }] } });
    expect(await api.getIssueByKey('ISSUE-1')).toEqual({ key: 'ISSUE-1' });

    get.mockResolvedValueOnce({ data: { issues: [] } });
    expect(await api.getIssueByKey('nope')).toBeNull();
  });

  it('R2.AC1: getProjectTestFiles queries the components tree for test files', async () => {
    get.mockResolvedValueOnce({ data: { components: [{ key: 'p:Foo.test.ts', path: 'Foo.test.ts' }] } });

    const files = await api.getProjectTestFiles();

    expect(get).toHaveBeenCalledWith(
      '/api/components/tree',
      expect.objectContaining({ params: expect.objectContaining({ component: 'my-project', qualifiers: 'UTS' }) })
    );
    expect(files).toHaveLength(1);
  });
});
