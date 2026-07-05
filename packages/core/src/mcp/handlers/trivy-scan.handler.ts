/**
 * Trivy Scan Dependencies Handler
 *
 * MCP handler for the `trivy_scan_dependencies` tool. Resolves the Trivy
 * scanner through the ScannerRegistry (the abstraction from the
 * scanner-abstraction-di spec, now used in production) and returns a
 * fix-ready SCA summary. The SonarQube path is untouched.
 */

import { ScannerRegistry } from '../../scanners/index.js';
import { TrivyScanner } from '../../trivy/TrivyScanner.js';
import { formatTrivyReport } from '../../trivy/trivy-report.js';
import { MCPResponse } from '../../shared/types/index.js';

export interface TrivyScanArgs {
  projectPath?: string;
}

export async function handleTrivyScanDependencies(
  args: TrivyScanArgs,
  _correlationId?: string
): Promise<MCPResponse> {
  const projectPath = args?.projectPath ?? process.cwd();

  // Resolve the scanner through the registry (proves R3.AC1 in production).
  const registry = new ScannerRegistry();
  registry.register(new TrivyScanner());
  const scanner = registry.get('trivy');

  const result = await scanner.scan({ projectPath });
  return {
    content: [{ type: 'text', text: formatTrivyReport(result) }],
  };
}
