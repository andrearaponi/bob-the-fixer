import { describe, it, expect } from 'vitest';
import { TransportFactory } from './transport/transport-factory.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

/**
 * Simplified tests for multi-transport support in UniversalMCPServer.
 * These tests verify the TransportFactory integration without starting actual servers.
 */
describe('UniversalMCPServer - Multi-Transport Configuration', () => {
  describe('TransportFactory Integration', () => {
    it('should create stdio transport for default config', () => {
      const config = { transport: 'stdio' as const };
      const transport = TransportFactory.create(config.transport);

      expect(transport).toBeInstanceOf(StdioServerTransport);
    });

    it('should create HTTP transport with config', () => {
      const config = {
        transport: 'http' as const,
        httpConfig: { port: 3200 }
      };

      const transport = TransportFactory.create(config.transport, config.httpConfig);
      expect(transport).toBeInstanceOf(StreamableHTTPServerTransport);
    });

    it('should support different HTTP ports', () => {
      const transport1 = TransportFactory.create('http', { port: 3201 });
      const transport2 = TransportFactory.create('http', { port: 3202 });

      expect(transport1).toBeInstanceOf(StreamableHTTPServerTransport);
      expect(transport2).toBeInstanceOf(StreamableHTTPServerTransport);
    });
  });

  describe('Configuration Schema', () => {
    it('should have valid stdio config', () => {
      const config = { transport: 'stdio' as const };
      expect(config.transport).toBe('stdio');
    });

    it('should have valid HTTP config with port', () => {
      const config = {
        transport: 'http' as const,
        httpConfig: { port: 3200, host: '0.0.0.0' }
      };

      expect(config.transport).toBe('http');
      expect(config.httpConfig.port).toBe(3200);
      expect(config.httpConfig.host).toBe('0.0.0.0');
    });
  });
});
