/**
 * Change Hotspot Status Handler
 *
 * MCP handler for sonar_change_hotspot_status. Persists a security-hotspot
 * review verdict to SonarQube (TO_REVIEW, or REVIEWED with a resolution).
 * Marking a hotspot SAFE requires confirm: true, enforced by the schema before
 * any network call.
 */

import { MCPResponse } from '../../shared/types/index.js';
import { sanitizeUrl } from '../../infrastructure/security/input-sanitization.js';
import { SonarAdmin } from '../../universal/sonar-admin.js';
import { SonarFindingMutator } from '../../sonar/api/SonarFindingMutator.js';
import { validateInput, SonarChangeHotspotStatusSchema } from '../../shared/validators/mcp-schemas.js';

export async function handleChangeHotspotStatus(args: any): Promise<MCPResponse> {
  try {
    const { hotspot, status, resolution, comment } = validateInput(
      SonarChangeHotspotStatusSchema,
      args,
      'sonar_change_hotspot_status'
    );

    const sonarUrl = sanitizeUrl(process.env.SONAR_URL ?? 'http://localhost:9000');
    const admin = new SonarAdmin(sonarUrl, process.env.SONAR_TOKEN);
    const mutator = new SonarFindingMutator(admin.client);

    await mutator.changeHotspotStatus(hotspot, status, resolution, comment);

    let text = `HOTSPOT STATUS CHANGED\n\nHotspot: ${hotspot}\nStatus: ${status}`;
    if (resolution) {
      text += `\nResolution: ${resolution}`;
    }

    return { content: [{ type: 'text', text }] };
  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `HOTSPOT STATUS ERROR\n\n${error.message}` }],
      isError: true,
    };
  }
}
