/**
 * Thin MCP handler for sonar_config_manager
 * Delegates to ConfigManager service
 */

import { ConfigManager } from '../../core/project/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { MCPResponse } from '../../shared/types/index.js';

/**
 * Handle config manager MCP tool request
 */
export async function handleConfigManager(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  const { action, showToken = false } = args;

  // Initialize dependencies
  const projectManager = new ProjectManager();
  const service = new ConfigManager(projectManager);

  let text: string;

  switch (action) {
    case 'view': {
      const info = await service.view({ showToken });
      text = ConfigManager.formatConfigInfo(info);
      break;
    }

    case 'validate': {
      const result = await service.validate();
      text = ConfigManager.formatValidationResult(result);
      break;
    }

    case 'reset': {
      const result = await service.reset();
      text = ConfigManager.formatResetResult(result);
      break;
    }

    default:
      throw new Error(`Unknown config action: ${action}`);
  }

  return {
    content: [{ type: 'text', text }]
  };
}
