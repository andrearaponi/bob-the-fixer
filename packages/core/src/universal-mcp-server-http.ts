#!/usr/bin/env node

import { UniversalBobTheFixerMCPServer } from './universal/universal-mcp-server.js';
import { getLogger } from './shared/logger/structured-logger.js';

const logger = getLogger();

async function main() {
  const port = parseInt(process.env.PORT ?? '3000', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  logger.info('Starting Bob the Fixer HTTP server', { port, host });

  const server = new UniversalBobTheFixerMCPServer({
    transport: 'http',
    httpConfig: { port, host }
  });

  try {
    await server.start();
    logger.info(`✅ Bob the Fixer HTTP server running`, {
      url: `http://${host}:${port}`,
      transport: 'http'
    });
    console.error(`\n✅ Bob the Fixer HTTP server running on http://${host}:${port}`);
    console.error(`🔧 Ready to receive MCP requests via HTTP`);
    console.error(`💡 Health check: http://${host}:${port}/health\n`);
  } catch (error) {
    logger.error('Failed to start HTTP server', error as Error);
    console.error('❌ Failed to start HTTP server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

main();
