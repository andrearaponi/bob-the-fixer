import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCommentIssue } from './comment-issue.handler';

vi.mock('../../universal/sonar-admin');
vi.mock('../../sonar/api/SonarFindingMutator.js');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleCommentIssue', () => {
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
    mockMutator = { commentIssue: vi.fn(async () => undefined) };
    capturedClient = undefined;
    vi.mocked(mutatorMod.SonarFindingMutator).mockImplementation(function (client: any) {
      capturedClient = client;
      return mockMutator as any;
    });

    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token-abcdefghijklmnop';
  });

  it('adds a comment to an issue', async () => {
    const result = await handleCommentIssue({ issue: 'ISSUE-1', text: 'Reachable from the request handler.' });

    expect(mockMutator.commentIssue).toHaveBeenCalledWith('ISSUE-1', 'Reachable from the request handler.');
    expect(result.content[0].text).toContain('COMMENT ADDED');
    expect(result.isError).toBeFalsy();
  });

  it('C1: constructs the mutator with SonarAdmin\'s authenticated client', async () => {
    await handleCommentIssue({ issue: 'ISSUE-1', text: 'note' });
    expect(capturedClient).toBe(SENTINEL_CLIENT);
  });

  it('R4.AC2: returns an actionable permission error as isError', async () => {
    mockMutator.commentIssue = vi.fn(async () => {
      throw new Error('Permission denied. The token needs the "Administer Issues" permission on the project.');
    });

    const result = await handleCommentIssue({ issue: 'ISSUE-1', text: 'note' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Administer Issues');
  });

  it('R4.AC3: returns a reachability/config error as isError', async () => {
    mockMutator.commentIssue = vi.fn(async () => {
      throw new Error('Could not reach SonarQube. Verify SONAR_URL points at a running server and that SONAR_TOKEN is set.');
    });

    const result = await handleCommentIssue({ issue: 'ISSUE-1', text: 'note' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Could not reach SonarQube');
  });
});
