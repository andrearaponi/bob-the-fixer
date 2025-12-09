#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  InitializeRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  SetLevelRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { TransportFactory, TransportMode, HTTPTransportConfig } from './transport/transport-factory.js';
import dotenv from 'dotenv';
import path from 'path';
import { ProjectManager } from './project-manager.js';

// Security and validation imports
import {
  ValidationError,
  validateEnvironment
} from '../shared/validators/mcp-schemas.js';
import {
  RateLimiter
} from '../infrastructure/security/input-sanitization.js';
import { getLogger, StructuredLogger } from '../shared/logger/structured-logger.js';
import { getMCPLogger, MCPLogger } from '../shared/logger/mcp-logger.js';
import { initializeVersionChecker, VersionChecker } from '../shared/version/index.js';
import {
  ToolExecutionError,
  wrapError
} from '../shared/errors/custom-errors.js';
import { getLifecycleManager, ServerLifecycleManager } from './server-lifecycle.js';
import pkg from '../../package.json';

// Layered architecture: MCP layer imports
import { toolDefinitions } from '../mcp/tool-definitions.js';
import { routeTool, toolExists } from '../mcp/ToolRouter.js';

/**
 * Configuration options for UniversalBobTheFixerMCPServer
 */
export interface ServerConfig {
  transport?: TransportMode;
  httpConfig?: HTTPTransportConfig;
}

const APP_VERSION = pkg.version;
const GITHUB_REPOSITORY = 'andrearaponi/bob-the-fixer';

class UniversalBobTheBuilderMCPServer {
  private readonly server: Server;
  private readonly rateLimiter: RateLimiter;
  private readonly logger: StructuredLogger = getLogger();
  private readonly mcpLogger: MCPLogger = getMCPLogger();
  private readonly lifecycle: ServerLifecycleManager = getLifecycleManager();
  private readonly config: ServerConfig;
  private versionChecker?: VersionChecker;

  constructor(config: ServerConfig = {}) {
    // CRITICAL FIX FOR GITHUB COPILOT CLI BUG
    // Copilot restarts the MCP server without environment variables after authentication.
    // We try to load them from local config file if they are missing.
    // Suppress stdout/stderr during dotenv loading to avoid breaking MCP protocol
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write; // Also suppress stderr for good measure

    // Temporarily replace write functions with no-ops
    process.stdout.write = () => true;
    process.stderr.write = () => true;

    try {
      dotenv.config({ path: path.join(process.cwd(), 'bobthefixer.env') });
    } catch (e) {
      // Log to our logger if it's available, otherwise ignore silently
      // In constructor, logger might not be fully initialized, so safest to ignore
      // this.logger.debug('Error loading dotenv config during startup', e);
    } finally {
      // Restore original write functions
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    }

    this.config = {
      transport: config.transport ?? 'stdio',
      httpConfig: config.httpConfig
    };

    // Validate environment variables first (silent during init)
    try {
      validateEnvironment();
    } catch (error) {
      if (error instanceof ValidationError) {
        // Only log errors during init if in development mode
        if (process.env.NODE_ENV !== 'production') {
          // Silent validation failure - will be logged after connect
        } else {
          process.exit(1);
        }
      }
    }

    this.server = new Server(
      {
        name: 'universal-bob-the-fixer',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
          logging: {},
        },
      }
    );


    // Initialize rate limiter (60 requests per minute per client)
    this.rateLimiter = new RateLimiter(60, 60000);

    this.setupHandlers();

    this.setupLoggingHandlers();

    // NOTE: mcpLogger.setServer() is called after server.connect()
    // to avoid any logging during protocol initialization

    // Setup lifecycle management
    this.setupLifecycleManagement();

  }

  private setupHandlers() {
    // Handle initialize request (MCP protocol)
    this.server.setRequestHandler(
      InitializeRequestSchema,
      async () => {
        return {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'universal-bob-the-fixer',
            version: '2.0.0'
          }
        };
      }
    );

    // List available tools
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => {
        return {
          tools: toolDefinitions
        };
      }
    );

    // Handle tool calls
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        const { name } = request.params;
        const args = request.params.arguments ?? {};
        const correlationId = this.logger.generateCorrelationId();
        
        // Record request for metrics
        this.lifecycle.recordRequest();

        // Check if server is shutting down
        if (this.lifecycle.isShutdownInProgress()) {
          return {
            content: [{
              type: 'text',
              text: 'Server is shutting down, please try again later'
            }],
            isError: true
          };
        }

        // Rate limiting - use a simple identifier (in production, use client ID)
        const clientId = 'default-client';
        if (!this.rateLimiter.isAllowed(clientId)) {
          this.logger.warn('Rate limit exceeded for client', { clientId, tool: name }, correlationId);
          return {
            content: [{
              type: 'text',
              text: 'Rate limit exceeded. Please wait before making more requests.'
            }],
            isError: true
          };
        }

        this.mcpLogger.debug('mcp-tools', `Tool request received: ${name}`, {
          toolName: name,
          argsCount: Object.keys(args).length,
          correlationId
        });
        
        const startTime = this.logger.startOperation(`tool:${name}`, { args }, correlationId);
        this.logger.toolInvoked(name, correlationId, { argsCount: Object.keys(args).length });
        this.mcpLogger.toolInvoked(name, correlationId, { argsCount: Object.keys(args).length });

        try {
          // Check if tool exists
          if (!toolExists(name)) {
            this.mcpLogger.error('mcp-tools', `Unknown tool requested: ${name}`, undefined, {
              toolName: name,
              correlationId
            });
            throw new ToolExecutionError(`Unknown tool: ${name}`, name, { correlationId });
          }

          // Route to handler using ToolRouter
          const result = await routeTool(name, args, correlationId);

          const duration = Date.now() - startTime;
          this.logger.toolCompleted(name, true, duration, correlationId);
          this.mcpLogger.toolCompleted(name, true, duration, correlationId);
          this.logger.endOperation(`tool:${name}`, startTime, true, { resultLength: result?.content?.length }, correlationId);

          return result as any;
        } catch (error: unknown) {
          const duration = Date.now() - startTime;
          const wrappedError = wrapError(error, correlationId, name);

          // Record error for metrics
          this.lifecycle.recordError();

          this.logger.toolCompleted(name, false, duration, correlationId);
          this.mcpLogger.toolCompleted(name, false, duration, correlationId);
          this.logger.endOperation(`tool:${name}`, startTime, false, { error: wrappedError.message }, correlationId);
          this.logger.error(`Tool execution failed: ${name}`, wrappedError, { tool: name }, correlationId);
          this.mcpLogger.error('mcp-tools', `Tool execution failed: ${name}`, wrappedError, { tool: name, correlationId });


          return {
            content: [{
              type: 'text',
              text: wrappedError.getUserMessage()
            }],
            isError: true
          };
        }
      }
    );
  }

  /**
   * Setup lifecycle management and health monitoring
   */
  private setupLifecycleManagement(): void {
    // Register server cleanup handlers
    this.lifecycle.onShutdown(async () => {
      this.logger.info('Shutting down MCP server transport');
      try {
        await this.server.close();
        this.logger.info('MCP server transport closed successfully');
      } catch (error) {
        this.logger.error('Error closing MCP server transport', error as Error);
      }
    });

    // Start health monitoring (check every 5 minutes)
    this.lifecycle.startHealthMonitoring(300000);
    
    this.logger.info('Lifecycle management configured');
  }

  /**
   * Initialize version checker for update notifications
   */
  private initializeVersionChecker(): void {
    this.versionChecker = initializeVersionChecker({
      currentVersion: APP_VERSION,
      repository: GITHUB_REPOSITORY,
      checkIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
      checkOnInit: true,
      includePrerelease: false,
    });

    // Register shutdown handler
    this.lifecycle.onShutdown(async () => {
      this.versionChecker?.destroy();
    });

    // Start the checker (non-blocking)
    this.versionChecker.start().catch(error => {
      this.logger.debug('Version checker initialization failed', { error });
    });
  }

  /**
   * Setup MCP logging handlers
   */
  private setupLoggingHandlers(): void {
    // Handle logging/setLevel requests
    this.server.setRequestHandler(
      SetLevelRequestSchema,
      async (request) => {
        try {
          const { level } = request.params;
          
          // Update both loggers
          const previousLevel = this.mcpLogger.getLevel();
          this.logger.updateConfig({ level: level as any });
          this.mcpLogger.setLevel(level);
          
          this.mcpLogger.notice('logging', `Log level changed to: ${level}`, { 
            previousLevel,
            newLevel: level
          });
          
          return { success: true };
        } catch (error) {
          this.mcpLogger.error('logging', 'Failed to set log level', error as Error, { 
            requestedLevel: request.params.level 
          });
          throw new ToolExecutionError(
            'Failed to set log level',
            'logging/setLevel',
            undefined
          );
        }
      }
    );
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {

      // Create transport based on configuration
      const transportMode = this.config.transport!;
      const transport = transportMode === 'stdio'
        ? TransportFactory.create('stdio')
        : TransportFactory.create('http', this.config.httpConfig);


      await this.server.connect(transport);


      // Server is now ready for client communication

      // NOW we can safely set up MCP logging - the MCP protocol is initialized
      this.mcpLogger.setServer(this.server);

      // Log server startup (use only this.logger to avoid MCP logging before client initialization)
      const serverInfo = this.lifecycle.getServerInfo();
      this.logger.info('MCP Server started successfully', {
        ...serverInfo,
        transport: this.config.transport
      });

      // Log environment status after successful connection
      this.logger.info('Environment configuration:', {
        SONAR_URL: process.env.SONAR_URL ? 'SET' : 'NOT SET',
        SONAR_TOKEN: process.env.SONAR_TOKEN ? `SET (${process.env.SONAR_TOKEN?.substring(0, 10)}...)` : 'NOT SET',
        NODE_ENV: process.env.NODE_ENV ?? 'NOT SET',
        TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY ? 'SET' : 'NOT SET'
      });

      // Perform health check in background (don't block initialization)
      this.lifecycle.performHealthCheck().then(initialHealth => {
        this.logger.info('Initial health check completed', { status: initialHealth.status });
      }).catch(error => {
        this.logger.warn('Initial health check failed', error as Error);
      });

      // Initialize version checker for update notifications
      this.initializeVersionChecker();

      // Sync environment variables to local config file (Backup for Copilot restart bug)
      // We do this non-blocking so we don't delay startup
      new ProjectManager().ensureConfigSync().catch(err => {
        this.logger.warn('Failed to sync environment to config file', err as Error);
      });

    } catch (error) {
      this.logger.error('Failed to start MCP server', error as Error);
      throw error;
    }
  }

  /**
   * Get server health status
   */
  async getHealth() {
    return await this.lifecycle.performHealthCheck();
  }

  /**
   * Get server metrics
   */
  getMetrics() {
    return this.lifecycle.getMetrics();
  }
}

export { UniversalBobTheBuilderMCPServer as UniversalBobTheFixerMCPServer };