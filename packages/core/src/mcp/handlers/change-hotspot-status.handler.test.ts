import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleChangeHotspotStatus } from './change-hotspot-status.handler';

vi.mock('../../universal/sonar-admin');
vi.mock('../../sonar/api/SonarFindingMutator.js');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleChangeHotspotStatus', () => {
  const SENTINEL_CLIENT = { marker: 'authed-client' };
  let mockMutator: any;
  let capturedClient: any;

  beforeEach(async () => {
    const security = await import('../../infrastructure/security/input-sanitization');
    vi.mocked(security.sanitizeUrl).mockImplementation((u: string) => u);

    const adminMod = await import('../../universal/sonar-admin');
    vi.mocked(adminMod.SonarAdmin).mockImplementation(function () {
      return { client: SENTINEL_CLIENT } as any;
    });

    const mutatorMod = await import('../../sonar/api/SonarFindingMutator.js');
    mockMutator = { changeHotspotStatus: vi.fn(async () => undefined) };
    capturedClient = undefined;
    vi.mocked(mutatorMod.SonarFindingMutator).mockImplementation(function (client: any) {
      capturedClient = client;
      return mockMutator as any;
    });

    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token-abcdefghijklmnop';
  });

  it('changes a hotspot status and echoes the resolution', async () => {
    const result = await handleChangeHotspotStatus({
      hotspot: 'H-1',
      status: 'REVIEWED',
      resolution: 'ACKNOWLEDGED',
      comment: 'Tracked in ticket-123.',
    });

    expect(mockMutator.changeHotspotStatus).toHaveBeenCalledWith('H-1', 'REVIEWED', 'ACKNOWLEDGED', 'Tracked in ticket-123.');
    expect(result.content[0].text).toContain('HOTSPOT STATUS CHANGED');
    expect(result.content[0].text).toContain('ACKNOWLEDGED');
    expect(result.isError).toBeFalsy();
  });

  it('C1: constructs the mutator with SonarAdmin\'s authenticated client', async () => {
    await handleChangeHotspotStatus({ hotspot: 'H-1', status: 'TO_REVIEW' });
    expect(capturedClient).toBe(SENTINEL_CLIENT);
  });

  it('R4.AC2: returns an actionable permission error naming the hotspot permission', async () => {
    mockMutator.changeHotspotStatus = vi.fn(async () => {
      throw new Error('Permission denied. The token needs the "Administer Security Hotspots" permission on the project.');
    });

    const result = await handleChangeHotspotStatus({ hotspot: 'H-1', status: 'REVIEWED', resolution: 'ACKNOWLEDGED' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Administer Security Hotspots');
  });

  it('R4.AC3: returns a reachability/config error as isError', async () => {
    mockMutator.changeHotspotStatus = vi.fn(async () => {
      throw new Error('Could not reach SonarQube. Verify SONAR_URL points at a running server and that SONAR_TOKEN is set.');
    });

    const result = await handleChangeHotspotStatus({ hotspot: 'H-1', status: 'TO_REVIEW' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Could not reach SonarQube');
  });

  it('R4.AC1: rejects a SAFE resolution without confirm before any network call', async () => {
    const result = await handleChangeHotspotStatus({ hotspot: 'H-1', status: 'REVIEWED', resolution: 'SAFE' });

    expect(result.isError).toBe(true);
    expect(mockMutator.changeHotspotStatus).not.toHaveBeenCalled();
  });
});
