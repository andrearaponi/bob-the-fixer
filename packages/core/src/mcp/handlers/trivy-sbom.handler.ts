/**
 * Trivy Generate SBOM Handler
 *
 * MCP handler for the `trivy_generate_sbom` tool. Generates a CycloneDX or SPDX
 * SBOM of the project's dependencies via Trivy, writes it to a file, and returns
 * a concise summary. The SonarQube path is untouched.
 */

import { generateSbom, SbomFormat } from '../../trivy/sbom.js';
import { MCPResponse } from '../../shared/types/index.js';

export interface TrivyGenerateSbomArgs {
  projectPath?: string;
  format?: SbomFormat;
  outputPath?: string;
}

export async function handleTrivyGenerateSbom(
  args: TrivyGenerateSbomArgs,
  _correlationId?: string
): Promise<MCPResponse> {
  const projectPath = args?.projectPath ?? process.cwd();
  try {
    const res = await generateSbom({
      projectPath,
      format: args?.format,
      outputPath: args?.outputPath,
    });
    const count =
      res.componentCount !== undefined ? `${res.componentCount} components` : 'component count unavailable';
    const spec = res.spec ? ` (${res.spec})` : '';
    return {
      content: [
        {
          type: 'text',
          text: `📦 SBOM generated\n\nFormat: ${res.format}${spec}\nComponents: ${count}\nWritten to: ${res.outputPath}`,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `SBOM GENERATION ERROR\n\n${error.message}` }],
      isError: true,
    };
  }
}
