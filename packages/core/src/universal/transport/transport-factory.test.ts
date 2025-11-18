import { describe, it, expect } from 'vitest';
import { TransportFactory } from './transport-factory.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

describe('TransportFactory', () => {
  describe('stdio transport', () => {
    it('should create stdio transport when mode is stdio', () => {
      const transport = TransportFactory.create('stdio');
      expect(transport).toBeInstanceOf(StdioServerTransport);
    });
  });

  describe('http transport', () => {
    it('should create HTTP transport when mode is http', () => {
      const config = { port: 3000, host: '0.0.0.0' };
      const transport = TransportFactory.create('http', config);
      expect(transport).toBeInstanceOf(StreamableHTTPServerTransport);
    });

    it('should use default HTTP config if not provided', () => {
      const transport = TransportFactory.create('http');
      expect(transport).toBeInstanceOf(StreamableHTTPServerTransport);
    });

    it('should create stateful transport with session ID by default', () => {
      const transport = TransportFactory.create('http');
      expect(transport.sessionId).toBeUndefined(); // Session ID is generated on first request
    });

    it('should allow custom session ID generator', () => {
      const customGenerator = () => 'custom-session-id';
      const transport = TransportFactory.create('http', {
        sessionIdGenerator: customGenerator
      });
      expect(transport).toBeInstanceOf(StreamableHTTPServerTransport);
    });
  });

  describe('error handling', () => {
    it('should throw error for unsupported transport mode', () => {
      expect(() => TransportFactory.create('unknown' as any))
        .toThrow('Unsupported transport mode');
    });
  });
});
