import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { Server } from 'http';
import { SessionManager } from './session-manager.js';
import { ProjectManager } from '../project-manager.js';
import { SonarQubeClient } from '../../sonar/client.js';

export interface HTTPServerConfig {
  port?: number;
  host?: string;
  cors?: boolean;
  rateLimit?: {
    windowMs?: number;
    max?: number;
  };
}

export class MCPHTTPServer {
  private app: Express;
  private server?: Server;
  private sessionManager: SessionManager;
  private config: Required<HTTPServerConfig>;

  constructor(config: HTTPServerConfig = {}) {
    this.config = {
      port: config.port ?? 3000,
      host: config.host ?? '0.0.0.0',
      cors: config.cors ?? true,
      rateLimit: {
        windowMs: config.rateLimit?.windowMs ?? 60000,
        max: config.rateLimit?.max ?? 60
      }
    };

    this.app = express();
    this.sessionManager = new SessionManager();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS
    if (this.config.cors) {
      this.app.use(cors());
    }

    // JSON body parser
    this.app.use(express.json());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false
    });

    this.app.use('/mcp', limiter);
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        sessions: this.sessionManager.getActiveSessionCount(),
        timestamp: new Date().toISOString()
      });
    });

    // Get SonarQube issues endpoint
    this.app.get('/api/issues', async (req: Request, res: Response) => {
      try {
        const projectManager = new ProjectManager();
        const config = await projectManager.getOrCreateConfig();

        if (!config) {
          return res.status(404).json({
            error: 'No active project found',
            message: 'Please configure a SonarQube project first',
            fallback: true,
            issues: this.getDemoIssues()
          });
        }

        const client = new SonarQubeClient(
          config.sonarUrl,
          config.sonarToken,
          config.sonarProjectKey
        );

        const issues = await client.getIssues({
          resolved: false
        });

        res.json({
          success: true,
          count: issues.length,
          issues: issues.slice(0, 100) // Limit to 100 issues for performance
        });
      } catch (error: any) {
        console.error('Error fetching issues:', error);
        res.status(500).json({
          error: 'Failed to fetch issues',
          message: error.message,
          // Provide fallback demo data if SonarQube is not configured
          fallback: true,
          issues: this.getDemoIssues()
        });
      }
    });

    // MCP endpoints will be set up by the transport
    // Placeholder for now
    this.app.post('/mcp/v1/messages', (req: Request, res: Response) => {
      res.status(501).json({
        error: 'MCP transport not initialized'
      });
    });
  }

  private getDemoIssues() {
    return [
      {
        key: 'demo:1',
        rule: 'java:S1192',
        severity: 'MINOR',
        message: 'Define a constant instead of duplicating this literal',
        type: 'CODE_SMELL',
        line: 12,
        component: 'src/main/java/OrderService.java'
      },
      {
        key: 'demo:2',
        rule: 'java:S2259',
        severity: 'MAJOR',
        message: 'A "NullPointerException" could be thrown',
        type: 'BUG',
        line: 13,
        component: 'src/main/java/OrderService.java'
      },
      {
        key: 'demo:3',
        rule: 'java:S3740',
        severity: 'MAJOR',
        message: 'Provide the parametrized type for this generic',
        type: 'CODE_SMELL',
        line: 10,
        component: 'src/main/java/OrderService.java'
      }
    ];
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      try {
        // Create error handler function to ensure proper cleanup
        const errorHandler = (error: Error) => {
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        };

        // Create the HTTP server and start listening
        this.server = this.app.listen(
          this.config.port,
          this.config.host,
          () => {
            // Don't resolve immediately - wait a tick to see if there's an error
            // This handles the race condition where both 'listening' and 'error' fire
            setImmediate(() => {
              if (!resolved) {
                resolved = true;
                this.server?.removeListener('error', errorHandler);
                resolve();
              }
            });
          }
        );

        // Attach error handler immediately after creating server
        this.server.once('error', errorHandler);
      } catch (error) {
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.sessionManager.destroy();
          this.server = undefined;
          resolve();
        }
      });
    });
  }

  getApp(): Express {
    return this.app;
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  getPort(): number {
    return this.config.port;
  }

  getHost(): string {
    return this.config.host;
  }
}
