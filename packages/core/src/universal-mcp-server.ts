#!/usr/bin/env node

import { UniversalBobTheFixerMCPServer } from './universal/universal-mcp-server.js';
import { getLogger } from './shared/logger/structured-logger.js';

// Initialize logger
const logger = getLogger();

// Start the universal server
async function main() {
  try {
    logger.info('Starting Universal Bob the Fixer MCP Server...');
    const server = new UniversalBobTheFixerMCPServer();
    await server.start();
  } catch (error) {
    logger.error('Failed to start Universal Bob the Fixer MCP Server', error as Error);
    process.exit(1);
  }
}

main().catch(error => {
  logger.error('Unexpected error in main', error as Error);
  process.exit(1);
});