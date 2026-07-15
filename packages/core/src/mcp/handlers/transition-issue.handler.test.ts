import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleTransitionIssue } from './transition-issue.handler';

vi.mock('../../universal/sonar-admin');
vi.mock('../../sonar/api/SonarFindingMutator.js');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleTransitionIssue', () => {
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
    mockMutator = {
      transitionIssue: vi.fn(async () => ({ transition: 'confirm', status: 'CONFIRMED' })),
    };
    capturedClient = undefined;
    vi.mocked(mutatorMod.SonarFindingMutator).mockImplementation(function (client: any) {
      capturedClient = client;
      return mockMutator as any;
    });

    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token-abcdefghijklmnop';
  });

  it('transitions an issue and reports the resulting status', async () => {
    const result = await handleTransitionIssue({ issue: 'ISSUE-1', transition: 'confirm' });

    expect(mockMutator.transitionIssue).toHaveBeenCalledWith('ISSUE-1', 'confirm', undefined);
    expect(result.content[0].text).toContain('ISSUE TRANSITIONED');
    expect(result.content[0].text).toContain('CONFIRMED');
    expect(result.isError).toBeFalsy();
  });

  it('C1: constructs the mutator with SonarAdmin\'s authenticated client', async () => {
    await handleTransitionIssue({ issue: 'ISSUE-1', transition: 'confirm' });
    expect(capturedClient).toBe(SENTINEL_CLIENT);
  });

  it('surfaces a partial-failure warning when the comment fails after the transition', async () => {
    mockMutator.transitionIssue = vi.fn(async () => ({
      transition: 'confirm',
      status: 'CONFIRMED',
      commentError: 'Empty comment',
    }));

    const result = await handleTransitionIssue({ issue: 'ISSUE-1', transition: 'confirm', comment: 'x' });

    expect(result.content[0].text).toContain('comment could not be added');
    expect(result.isError).toBeFalsy(); // transition itself persisted
  });

  it('R4.AC2: returns an actionable permission error as isError', async () => {
    mockMutator.transitionIssue = vi.fn(async () => {
      throw new Error('Permission denied. The token needs the "Administer Issues" permission on the project.');
    });

    const result = await handleTransitionIssue({ issue: 'ISSUE-1', transition: 'confirm' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Administer Issues');
  });

  it('R4.AC3: returns a reachability/config error as isError', async () => {
    mockMutator.transitionIssue = vi.fn(async () => {
      throw new Error('Could not reach SonarQube. Verify SONAR_URL points at a running server and that SONAR_TOKEN is set.');
    });

    const result = await handleTransitionIssue({ issue: 'ISSUE-1', transition: 'confirm' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Could not reach SonarQube');
  });

  it('R4.AC1: rejects a dismissive verdict without confirm before any network call', async () => {
    const result = await handleTransitionIssue({ issue: 'ISSUE-1', transition: 'falsepositive' });

    expect(result.isError).toBe(true);
    expect(mockMutator.transitionIssue).not.toHaveBeenCalled();
  });
});
