import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarFindingMutator } from './SonarFindingMutator.js';

describe('SonarFindingMutator', () => {
  let post: ReturnType<typeof vi.fn>;
  let mutator: SonarFindingMutator;

  beforeEach(() => {
    post = vi.fn();
    mutator = new SonarFindingMutator({ post } as any);
  });

  it('R1.AC1: transitionIssue posts the transition to issues/do_transition', async () => {
    post.mockResolvedValueOnce({ data: { issue: { status: 'RESOLVED' } } });

    await mutator.transitionIssue('ISSUE-1', 'falsepositive');

    expect(post).toHaveBeenCalledWith('/api/issues/do_transition', expect.any(URLSearchParams));
    const body = post.mock.calls[0][1] as URLSearchParams;
    expect(body.get('issue')).toBe('ISSUE-1');
    expect(body.get('transition')).toBe('falsepositive');
  });

  it('R1.AC2: transitionIssue returns the resulting status reported by SonarQube', async () => {
    post.mockResolvedValueOnce({ data: { issue: { status: 'RESOLVED', resolution: 'FALSE-POSITIVE' } } });

    const result = await mutator.transitionIssue('ISSUE-1', 'falsepositive');

    expect(result).toEqual({ transition: 'falsepositive', status: 'RESOLVED' });
  });

  it('R1.AC4: transitionIssue surfaces SonarQube\'s rejection message', async () => {
    post.mockRejectedValueOnce({
      response: { status: 400, data: { errors: [{ msg: 'Transition from state RESOLVED does not exist' }] } },
    });

    await expect(mutator.transitionIssue('ISSUE-1', 'resolve')).rejects.toThrow(
      'Transition from state RESOLVED does not exist'
    );
  });

  it('R2.AC1: commentIssue posts the text to issues/add_comment', async () => {
    post.mockResolvedValueOnce({ data: {} });

    await mutator.commentIssue('ISSUE-1', 'Not exploitable: input is a compile-time constant.');

    expect(post).toHaveBeenCalledWith('/api/issues/add_comment', expect.any(URLSearchParams));
    const body = post.mock.calls[0][1] as URLSearchParams;
    expect(body.get('issue')).toBe('ISSUE-1');
    expect(body.get('text')).toBe('Not exploitable: input is a compile-time constant.');
  });

  it('R2.AC1: transitionIssue attaches an optional comment after the transition', async () => {
    post
      .mockResolvedValueOnce({ data: { issue: { status: 'CONFIRMED' } } }) // do_transition
      .mockResolvedValueOnce({ data: {} }); // add_comment

    const result = await mutator.transitionIssue('ISSUE-1', 'confirm', 'Real: reachable from the request handler.');

    expect(post).toHaveBeenNthCalledWith(1, '/api/issues/do_transition', expect.any(URLSearchParams));
    expect(post).toHaveBeenNthCalledWith(2, '/api/issues/add_comment', expect.any(URLSearchParams));
    expect(result.commentError).toBeUndefined();
  });

  it('reports commentError without throwing when the transition persisted but the comment failed', async () => {
    post
      .mockResolvedValueOnce({ data: { issue: { status: 'CONFIRMED' } } }) // do_transition ok
      .mockRejectedValueOnce({ response: { status: 400, data: { errors: [{ msg: 'Empty comment' }] } } }); // comment fails

    const result = await mutator.transitionIssue('ISSUE-1', 'confirm', 'x');

    expect(result.status).toBe('CONFIRMED');
    expect(result.commentError).toContain('Empty comment');
  });

  it('R3.AC1: changeHotspotStatus posts status, resolution and comment to hotspots/change_status', async () => {
    post.mockResolvedValueOnce({ data: {} });

    await mutator.changeHotspotStatus('HOTSPOT-1', 'REVIEWED', 'SAFE', 'Guarded by an allowlist.');

    expect(post).toHaveBeenCalledWith('/api/hotspots/change_status', expect.any(URLSearchParams));
    const body = post.mock.calls[0][1] as URLSearchParams;
    expect(body.get('hotspot')).toBe('HOTSPOT-1');
    expect(body.get('status')).toBe('REVIEWED');
    expect(body.get('resolution')).toBe('SAFE');
    expect(body.get('comment')).toBe('Guarded by an allowlist.');
  });

  it('R3.AC1: changeHotspotStatus omits resolution and comment when not provided', async () => {
    post.mockResolvedValueOnce({ data: {} });

    await mutator.changeHotspotStatus('HOTSPOT-1', 'TO_REVIEW');

    const body = post.mock.calls[0][1] as URLSearchParams;
    expect(body.get('status')).toBe('TO_REVIEW');
    expect(body.has('resolution')).toBe(false);
    expect(body.has('comment')).toBe(false);
  });

  it('R4.AC2: a 403 on an issue names the "Administer Issues" permission', async () => {
    post.mockRejectedValue({
      response: { status: 403, data: { errors: [{ msg: 'Insufficient privileges' }] } },
    });

    await expect(mutator.transitionIssue('ISSUE-1', 'confirm')).rejects.toThrow('Administer Issues');
  });

  it('R4.AC2: a 403 on a hotspot names the "Administer Security Hotspots" permission', async () => {
    post.mockRejectedValue({ response: { status: 403, data: {} } });

    await expect(mutator.changeHotspotStatus('HOTSPOT-1', 'REVIEWED', 'SAFE')).rejects.toThrow(
      'Administer Security Hotspots'
    );
  });

  it('R4.AC3: a missing HTTP response yields a reachability/config error', async () => {
    post.mockRejectedValue({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:9000' });

    await expect(mutator.commentIssue('ISSUE-1', 'hi')).rejects.toThrow(/Could not reach SonarQube/);
  });

  it('NFR2: the token carried on the axios error never leaks into the thrown message', async () => {
    const token = 'squ_super_secret_token_abcdef0123456789';
    post.mockRejectedValue({
      response: { status: 403, data: { errors: [{ msg: 'Insufficient privileges' }] } },
      config: { headers: { Authorization: `Bearer ${token}` } },
      request: { _header: `Authorization: Bearer ${token}` },
    });

    const err = await mutator.transitionIssue('ISSUE-1', 'falsepositive').catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).not.toContain(token);
    expect(err.message).toContain('Administer Issues');
  });
});
