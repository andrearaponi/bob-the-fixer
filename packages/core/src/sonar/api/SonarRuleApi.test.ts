import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarRuleApi } from './SonarRuleApi.js';

describe('SonarRuleApi', () => {
  let get: ReturnType<typeof vi.fn>;
  let api: SonarRuleApi;

  beforeEach(() => {
    get = vi.fn();
    api = new SonarRuleApi({ get } as any);
  });

  const ruleShow = (key: string) => ({
    data: {
      rule: {
        key,
        name: `Rule ${key}`,
        type: 'CODE_SMELL',
        severity: 'MAJOR',
        status: 'READY',
        tags: [],
        lang: 'ts',
      },
    },
  });

  it('R2.AC1: getRuleDetails maps /api/rules/show into SonarRuleDetails', async () => {
    get.mockResolvedValueOnce(ruleShow('ts:S1'));

    const d = await api.getRuleDetails('ts:S1');

    expect(get).toHaveBeenCalledWith(
      '/api/rules/show',
      expect.objectContaining({ params: expect.objectContaining({ key: 'ts:S1' }) })
    );
    expect(d.key).toBe('ts:S1');
    expect(d.name).toBe('Rule ts:S1');
    expect(d.type).toBe('CODE_SMELL');
  });

  it('R2.AC2: getRuleDetails caches by key — a second call does not re-fetch', async () => {
    get.mockResolvedValueOnce(ruleShow('ts:S1'));

    await api.getRuleDetails('ts:S1');
    await api.getRuleDetails('ts:S1');

    expect(get.mock.calls.filter((c) => c[0] === '/api/rules/show').length).toBe(1);
  });

  it('getRulesSearch returns the paginated rules payload', async () => {
    get.mockResolvedValueOnce({
      data: { total: 2, p: 1, ps: 100, rules: [{ key: 'ts:S1' }, { key: 'ts:S2' }] },
    });

    const res = await api.getRulesSearch({ languages: ['ts'] });

    expect(get).toHaveBeenCalledWith(
      '/api/rules/search',
      expect.objectContaining({ params: expect.objectContaining({ languages: 'ts' }) })
    );
    expect(res.total).toBe(2);
    expect(res.rules).toHaveLength(2);
  });

  it('R2.AC1: getUniqueRulesInfo aggregates rule details for unique rule keys', async () => {
    get.mockImplementation(async (_url: string, cfg: any) => ruleShow(cfg.params.key));

    const issues = [{ rule: 'ts:S1' }, { rule: 'ts:S1' }, { rule: 'ts:S2' }];
    const info = await api.getUniqueRulesInfo(issues);

    expect(Object.keys(info).sort()).toEqual(['ts:S1', 'ts:S2']);
    // one /api/rules/show per unique rule (deduped), not per issue
    expect(get.mock.calls.filter((c) => c[0] === '/api/rules/show').length).toBe(2);
  });
});
