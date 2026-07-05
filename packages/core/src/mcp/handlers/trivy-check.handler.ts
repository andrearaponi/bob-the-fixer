/**
 * Trivy Check Installation Handler
 *
 * MCP handler for the `trivy_check_installation` tool. Reports whether Trivy
 * is installed and its version, or actionable installation guidance.
 */

import { TrivyScanner } from '../../trivy/TrivyScanner.js';
import { MCPResponse } from '../../shared/types/index.js';

export async function handleTrivyCheckInstallation(
  _args: unknown,
  _correlationId?: string
): Promise<MCPResponse> {
  const health = await new TrivyScanner().checkHealth();

  const text = health.available
    ? `✅ Trivy is installed${health.version ? ` (version ${health.version})` : ''} and ready for dependency scanning.`
    : `❌ ${health.errorMessage}`;

  return {
    content: [{ type: 'text', text }],
    isError: !health.available,
  };
}
