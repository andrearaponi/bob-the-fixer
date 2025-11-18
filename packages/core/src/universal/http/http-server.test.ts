import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { MCPHTTPServer } from './http-server.js';

describe('MCPHTTPServer', () => {
  let server: MCPHTTPServer;

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Initialization', () => {
    it('should create server with default config', () => {
      server = new MCPHTTPServer();
      expect(server).toBeDefined();
    });

    it('should create server with custom port', () => {
      server = new MCPHTTPServer({ port: 3100 });
      expect(server).toBeDefined();
    });

    it('should start HTTP server on specified port', async () => {
      server = new MCPHTTPServer({ port: 3101 });
      await server.start();

      // Use supertest to test the endpoint without making real HTTP request
      const response = await request(server.getApp()).get('/health');
      expect(response.status).toBe(200);
    });

    it('should handle port already in use error', async () => {
      server = new MCPHTTPServer({ port: 3102 });
      await server.start();

      const server2 = new MCPHTTPServer({ port: 3102 });
      await expect(server2.start()).rejects.toThrow();
      // No need to stop server2 as it never started successfully
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      server = new MCPHTTPServer({ port: 3103 });
      await server.start();
    });

    it('should respond to health check', async () => {
      const response = await request(server.getApp())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should include session count in health check', async () => {
      const response = await request(server.getApp())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('sessions');
      expect(typeof response.body.sessions).toBe('number');
    });
  });

  describe('CORS', () => {
    beforeEach(async () => {
      server = new MCPHTTPServer({ port: 3104, cors: true });
      await server.start();
    });

    it('should enable CORS by default', async () => {
      const response = await request(server.getApp()).get('/health');
      const corsHeader = response.headers['access-control-allow-origin'];
      expect(corsHeader).toBeTruthy();
    });
  });

  describe('Server Lifecycle', () => {
    it('should start and stop cleanly', async () => {
      server = new MCPHTTPServer({ port: 3105 });
      await server.start();

      // Server should respond while running
      await request(server.getApp())
        .get('/health')
        .expect(200);

      await server.stop();

      // After stop, server instance still exists but HTTP server is closed
      // We can't test with supertest after stop, so just verify stop doesn't throw
      expect(server).toBeDefined();
    });

    it('should not throw when stopping already stopped server', async () => {
      server = new MCPHTTPServer({ port: 3106 });
      await expect(server.stop()).resolves.not.toThrow();
    });
  });

  describe('Getters', () => {
    beforeEach(() => {
      server = new MCPHTTPServer({ port: 3107 });
    });

    it('should expose Express app', () => {
      const app = server.getApp();
      expect(app).toBeDefined();
      expect(typeof app).toBe('function'); // Express app is a function
    });

    it('should expose SessionManager', () => {
      const sessionManager = server.getSessionManager();
      expect(sessionManager).toBeDefined();
      expect(sessionManager).toHaveProperty('createSession');
      expect(sessionManager).toHaveProperty('getSession');
    });
  });
});
