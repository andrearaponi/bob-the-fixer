import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../trivy/sbom.js', () => ({ generateSbom: vi.fn() }));

import { handleTrivyGenerateSbom } from './trivy-sbom.handler.js';
import { generateSbom } from '../../trivy/sbom.js';

describe('handleTrivyGenerateSbom', () => {
  beforeEach(() => vi.clearAllMocks());

  it('R2.AC2: returns a concise summary (format, count, path)', async () => {
    vi.mocked(generateSbom).mockResolvedValue({
      format: 'cyclonedx',
      outputPath: '/p/sbom.cyclonedx.json',
      componentCount: 107,
      spec: '1.5',
    } as any);

    const res = await handleTrivyGenerateSbom({ projectPath: '/p' });

    expect(res.content[0].text).toContain('cyclonedx');
    expect(res.content[0].text).toContain('107');
    expect(res.content[0].text).toContain('/p/sbom.cyclonedx.json');
    expect(res.isError).toBeUndefined();
  });

  it('returns an actionable error (isError) when Trivy is missing', async () => {
    vi.mocked(generateSbom).mockRejectedValue(new Error('Trivy is not installed or not found on PATH.'));

    const res = await handleTrivyGenerateSbom({});

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('not installed');
  });
});
