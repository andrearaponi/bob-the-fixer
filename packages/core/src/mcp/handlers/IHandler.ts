/**
 * Handler Interface
 *
 * Base interface for all MCP tool handlers.
 * Handlers are injectable classes that process MCP tool requests.
 */

import { MCPResponse } from '../../shared/types/index.js';

/**
 * Base handler interface for MCP tools
 */
export interface IHandler<TArgs = any> {
  /**
   * Handle the MCP tool request
   * @param args - Tool arguments
   * @param correlationId - Optional correlation ID for tracing
   */
  handle(args: TArgs, correlationId?: string): Promise<MCPResponse>;
}

/**
 * Handler function signature (for backwards compatibility)
 */
export type ToolHandler = (args: any, correlationId?: string) => Promise<MCPResponse>;

/**
 * Handler class constructor type
 */
export interface HandlerClass<TArgs = any> {
  new (...args: any[]): IHandler<TArgs>;
}
