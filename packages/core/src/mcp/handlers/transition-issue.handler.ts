/**
 * Transition Issue Handler
 *
 * MCP handler for sonar_transition_issue. Persists a decided verdict (confirm,
 * resolve, false positive, accept, reopen) to SonarQube, optionally attaching a
 * comment. Dismissive verdicts (falsepositive/accept) require confirm: true,
 * enforced by the schema before any network call.
 */

import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { SonarFindingMutator } from '../../sonar/api/SonarFindingMutator.js';
import { validateInput, SonarTransitionIssueSchema } from '../../shared/validators/mcp-schemas.js';

export async function handleTransitionIssue(args: any): Promise<MCPResponse> {
  try {
    const { issue, transition, comment } = validateInput(
      SonarTransitionIssueSchema,
      args,
      'sonar_transition_issue'
    );

    const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
    const admin = new SonarAdmin(sonarUrl, process.env.SONAR_TOKEN);
    const mutator = new SonarFindingMutator(admin.client);

    const result = await mutator.transitionIssue(issue, transition, comment);

    let text = `ISSUE TRANSITIONED\n\nIssue: ${issue}\nTransition: ${transition}`;
    if (result.status) {
      text += `\nNew status: ${result.status}`;
    }
    if (comment && !result.commentError) {
      text += `\nComment added.`;
    }
    if (result.commentError) {
      text += `\n\n⚠️  The transition was applied, but the comment could not be added: ${result.commentError}`;
    }

    return { content: [{ type: 'text', text }] };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `ISSUE TRANSITION ERROR\n\n${error.message}` }],
      isError: true,
    };
  }
}
