import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarMeasureApi } from './SonarMeasureApi.js';

describe('SonarMeasureApi', () => {
  let get: ReturnType<typeof vi.fn>;
  let api: SonarMeasureApi;

  beforeEach(() => {
    get = vi.fn();
    api = new SonarMeasureApi({ get } as any, 'my-project');
  });

  it('R2.AC1: getProjectMetrics queries the project component with the project key', async () => {
    get.mockResolvedValueOnce({ data: { component: { measures: [{ metric: 'coverage', value: '80' }] } } });

    const res: any = await api.getProjectMetrics();

    expect(get).toHaveBeenCalledWith(
      '/api/measures/component',
      expect.objectContaining({ params: expect.objectContaining({ component: 'my-project' }) })
    );
    expect(res.component.measures[0].metric).toBe('coverage');
  });

  it('R2.AC1: getSecurityHotspots defaults to TO_REVIEW (one call) and dedupes by key', async () => {
    get.mockResolvedValueOnce({ data: { hotspots: [{ key: 'H1' }, { key: 'H2' }, { key: 'H1' }] } });

    const hotspots = await api.getSecurityHotspots();

    expect(get).toHaveBeenCalledWith(
      '/api/hotspots/search',
      expect.objectContaining({ params: expect.objectContaining({ projectKey: 'my-project', status: 'TO_REVIEW' }) })
    );
    expect(get.mock.calls.filter((c) => c[0] === '/api/hotspots/search').length).toBe(1);
    expect(hotspots.map((h: any) => h.key)).toEqual(['H1', 'H2']); // deduped
  });

  it('R2.AC1: getFilesWithDuplication keeps only files with duplicated lines > 0', async () => {
    get.mockResolvedValueOnce({
      data: {
        components: [
          { key: 'F1', measures: [{ metric: 'duplicated_lines', value: '5' }] },
          { key: 'F2', measures: [{ metric: 'duplicated_lines', value: '0' }] },
        ],
      },
    });

    const res: any = await api.getFilesWithDuplication();

    expect(get).toHaveBeenCalledWith(
      '/api/components/tree',
      expect.objectContaining({ params: expect.objectContaining({ component: 'my-project', qualifiers: 'FIL' }) })
    );
    expect(res.components.map((c: any) => c.key)).toEqual(['F1']);
  });
});
