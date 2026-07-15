/**
 * Comment Issue Handler
 *
 * MCP handler for sonar_comment_issue. Attaches an auditable rationale comment
 * to an issue in SonarQube.
 */

import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { SonarFindingMutator } from '../../sonar/api/SonarFindingMutator.js';
import { validateInput, SonarCommentIssueSchema } from '../../shared/validators/mcp-schemas.js';

export async function handleCommentIssue(args: any): Promise<MCPResponse> {
  try {
    const { issue, text } = validateInput(SonarCommentIssueSchema, args, 'sonar_comment_issue');

    const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
    const admin = new SonarAdmin(sonarUrl, process.env.SONAR_TOKEN);
    const mutator = new SonarFindingMutator(admin.client);

    await mutator.commentIssue(issue, text);

    return { content: [{ type: 'text', text: `COMMENT ADDED\n\nIssue: ${issue}` }] };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `ISSUE COMMENT ERROR\n\n${error.message}` }],
      isError: true,
    };
  }
}
