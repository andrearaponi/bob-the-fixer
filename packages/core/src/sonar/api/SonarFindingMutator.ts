/**
 * SonarQube Finding Mutator
 *
 * Persists a decided verdict back to SonarQube: transition an issue, comment an
 * issue, or change a security hotspot's status. Write-side counterpart to the
 * read modules in this directory — depends only on an authenticated Axios client
 * (Bearer + application/x-www-form-urlencoded), with no token or env concerns.
 *
 * Errors are surfaced, not swallowed: translateSonarError maps HTTP failures to
 * actionable messages, reading only the status and response body so the token
 * never leaks into an error string.
 */

import { AxiosInstance } from 'axios';

export type IssueTransition = 'confirm' | 'resolve' | 'falsepositive' | 'accept' | 'reopen';
export type HotspotStatus = 'TO_REVIEW' | 'REVIEWED';
export type HotspotResolution = 'SAFE' | 'FIXED' | 'ACKNOWLEDGED';

export interface TransitionResult {
  transition: IssueTransition;
  /** Issue status reported by SonarQube after the transition, when available. */
  status?: string;
  /** Set when a follow-up comment was requested but failed after a successful transition. */
  commentError?: string;
}

export class SonarFindingMutator {
  constructor(private readonly client: AxiosInstance) {}

  /**
   * Transition an issue to a decided state (issues/do_transition). When `comment`
   * is provided it is attached via issues/add_comment after the transition
   * succeeds. The two calls are not atomic: if the transition persists but the
   * comment fails, the failure is reported in `commentError` rather than thrown,
   * so the caller knows the verdict itself was recorded.
   */
  async transitionIssue(
    issueKey: string,
    transition: IssueTransition,
    comment?: string
  ): Promise<TransitionResult> {
    let status: string | undefined;
    try {
      const params = new URLSearchParams();
      params.append('issue', issueKey);
      params.append('transition', transition);
      const response = await this.client.post('/api/issues/do_transition', params);
      status = response.data?.issue?.status;
    } catch (error: any) {
      throw translateSonarError(error, 'issue');
    }

    const result: TransitionResult = { transition, status };
    if (comment && comment.trim().length > 0) {
      try {
        await this.commentIssue(issueKey, comment);
      } catch (error: any) {
        result.commentError = error?.message ?? String(error);
      }
    }
    return result;
  }

  /** Attach a comment to an issue (issues/add_comment). */
  async commentIssue(issueKey: string, text: string): Promise<void> {
    try {
      const params = new URLSearchParams();
      params.append('issue', issueKey);
      params.append('text', text);
      await this.client.post('/api/issues/add_comment', params);
    } catch (error: any) {
      throw translateSonarError(error, 'issue');
    }
  }

  /** Change a security hotspot's status (hotspots/change_status). */
  async changeHotspotStatus(
    hotspotKey: string,
    status: HotspotStatus,
    resolution?: HotspotResolution,
    comment?: string
  ): Promise<void> {
    try {
      const params = new URLSearchParams();
      params.append('hotspot', hotspotKey);
      params.append('status', status);
      if (resolution) {
        params.append('resolution', resolution);
      }
      if (comment && comment.trim().length > 0) {
        params.append('comment', comment);
      }
      await this.client.post('/api/hotspots/change_status', params);
    } catch (error: any) {
      throw translateSonarError(error, 'hotspot');
    }
  }
}

/**
 * Translate a SonarQube write failure into a safe, actionable Error. Reads only
 * the HTTP status and response body (`data.errors[].msg`); it never stringifies
 * the Axios error or its config, so the Authorization header/token cannot leak
 * into the message.
 */
function translateSonarError(error: any, target: 'issue' | 'hotspot'): Error {
  const status = error?.response?.status;
  const sonarMsg = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors.map((e: any) => e?.msg).filter(Boolean).join(', ')
    : undefined;

  // No HTTP response: the server is unreachable or misconfigured.
  if (!error?.response) {
    return new Error(
      'Could not reach SonarQube. Verify SONAR_URL points at a running server and that SONAR_TOKEN is set.'
    );
  }

  // Missing or invalid token.
  if (status === 401) {
    return new Error(
      'SonarQube rejected the token (HTTP 401). Check that SONAR_TOKEN is set and has not expired.'
    );
  }

  // Valid token, insufficient permission for this mutation.
  if (status === 403) {
    const permission = target === 'hotspot' ? 'Administer Security Hotspots' : 'Administer Issues';
    return new Error(
      `Permission denied. The token needs the "${permission}" permission on the project` +
        (sonarMsg ? ` (SonarQube: ${sonarMsg})` : '') +
        '.'
    );
  }

  // Anything else: surface SonarQube's own rejection message.
  return new Error(sonarMsg || `SonarQube rejected the request (HTTP ${status ?? 'unknown'}).`);
}
