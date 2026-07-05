import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarSourceFetcher } from './SonarSourceFetcher.js';

describe('SonarSourceFetcher', () => {
  let get: ReturnType<typeof vi.fn>;
  let fetcher: SonarSourceFetcher;

  beforeEach(() => {
    get = vi.fn();
    fetcher = new SonarSourceFetcher({ get } as any);
  });

  it('R2.AC1: fetches source lines from the sources/index endpoint', async () => {
    get.mockResolvedValueOnce({ data: { '1': 'line one', '2': 'line two', '3': 'line three' } });

    const lines = await fetcher.getSourceLines('proj:File.ts', 1, 2);

    expect(get).toHaveBeenCalledWith(
      '/api/sources/index',
      expect.objectContaining({ params: expect.objectContaining({ resource: 'proj:File.ts' }) })
    );
    expect(lines).toEqual([
      { line: 1, code: 'line one' },
      { line: 2, code: 'line two' },
    ]);
  });

  it('falls back to the raw file download when the index is empty', async () => {
    get.mockResolvedValueOnce({ data: {} }); // index empty
    get.mockResolvedValueOnce({ data: 'a\nb\nc\nd' }); // raw

    const lines = await fetcher.getSourceLines('proj:File.ts', 2, 3);

    expect(lines).toEqual([
      { line: 2, code: 'b' },
      { line: 3, code: 'c' },
    ]);
  });

  it('R2.AC2: caches the raw file — a second range from the same file does not re-download', async () => {
    get.mockResolvedValueOnce({ data: {} }); // index (1st getSourceLines)
    get.mockResolvedValueOnce({ data: 'a\nb\nc\nd\ne' }); // raw
    get.mockResolvedValueOnce({ data: {} }); // index (2nd getSourceLines)

    await fetcher.getSourceLines('proj:File.ts', 1, 2);
    await fetcher.getSourceLines('proj:File.ts', 4, 5);

    const rawCalls = get.mock.calls.filter((c) => c[0] === '/api/sources/raw');
    expect(rawCalls.length).toBe(1);
  });

  it('returns [] on error in best-effort mode', async () => {
    get.mockRejectedValue(new Error('boom'));

    const lines = await fetcher.getSourceLines('proj:File.ts', 1, 5, { bestEffort: true });

    expect(lines).toEqual([]);
  });

  it('getSourceContext returns the joined code around the line', async () => {
    get.mockResolvedValueOnce({ data: { '4': 'four', '5': 'five', '6': 'six' } });

    const ctx = await fetcher.getSourceContext('proj:File.ts', 5, 1);

    expect(ctx).toBe('four\nfive\nsix');
  });
});
