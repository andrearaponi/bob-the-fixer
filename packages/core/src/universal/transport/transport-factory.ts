import { randomUUID } from 'crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export type TransportMode = 'stdio' | 'http';

export interface HTTPTransportConfig {
  port?: number;
  host?: string;
  basePath?: string;
  sessionIdGenerator?: (() => string) | undefined;
}

export class TransportFactory {
  static create(mode: 'stdio'): StdioServerTransport;
  static create(mode: 'http', config?: HTTPTransportConfig): StreamableHTTPServerTransport;
  static create(
    mode: TransportMode,
    config?: HTTPTransportConfig
  ): StdioServerTransport | StreamableHTTPServerTransport {
    switch (mode) {
      case 'stdio':
        return new StdioServerTransport();

      case 'http': {
        // Use default session ID generator (stateful mode)
        const sessionIdGenerator = config?.sessionIdGenerator ?? (() => randomUUID());

        return new StreamableHTTPServerTransport({
          sessionIdGenerator
        });
      }

      default:
        throw new Error(`Unsupported transport mode: ${mode}`);
    }
  }
}
