/**
 * Config Manager Handler
 *
 * MCP handler for sonar_config_manager tool.
 * Uses dependency injection for testability.
 */

import { injectable, inject } from 'tsyringe';
import { ConfigManager, ConfigAction } from '../../core/project/index.js';
import { IProjectManager } from '../../infrastructure/interfaces/index.js';
import { TOKENS } from '../../infrastructure/di/tokens.js';
import { MCPResponse } from '../../shared/types/index.js';
import { ProjectManager } from '../../universal/project-manager.js';
import { IHandler } from './IHandler.js';

/**
 * Arguments for config manager handler
 */
export interface ConfigManagerArgs {
  action: ConfigAction;
  showToken?: boolean;
}

/**
 * Injectable config manager handler class
 */
@injectable()
export class ConfigManagerHandler implements IHandler<ConfigManagerArgs> {
  constructor(
    @inject(TOKENS.ProjectManager) private readonly projectManager: IProjectManager
  ) {}

  async handle(args: ConfigManagerArgs, correlationId?: string): Promise<MCPResponse> {
    const { action, showToken = false } = args;

    const service = new ConfigManager(this.projectManager as any);

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
      content: [{ type: 'text', text }],
    };
  }
}

/**
 * Handle config manager MCP tool request
 *
 * @deprecated Use ConfigManagerHandler class with DI instead
 */
export async function handleConfigManager(
  args: any,
  correlationId?: string
): Promise<MCPResponse> {
  const { action, showToken = false } = args;

  // Initialize dependencies (legacy approach)
  const projectManager = new ProjectManager();
  const service = new ConfigManager(projectManager as any);

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
    content: [{ type: 'text', text }],
  };
}
