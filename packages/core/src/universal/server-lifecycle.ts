import { StructuredLogger, getLogger } from '../shared/logger/structured-logger.js';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  version: string;
  uptime: number;
  checks: {
    [service: string]: {
      status: 'ok' | 'warning' | 'error';
      message?: string;
      responseTime?: number;
    };
  };
}

export interface ServerMetrics {
  uptime: number;
  requestCount: number;
  errorCount: number;
  lastActivity: Date;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
}

/**
 * Manages server lifecycle, health checks, and graceful shutdown
 */
export class ServerLifecycleManager {
  private readonly logger: StructuredLogger;
  private readonly startTime: Date;
  private isShuttingDown = false;
  private readonly shutdownTimeout = 30000; // 30 seconds
  private requestCount = 0;
  private errorCount = 0;
  private lastActivity: Date;
  private readonly shutdownHandlers: (() => Promise<void>)[] = [];
  
  constructor() {
    this.logger = getLogger();
    this.startTime = new Date();
    this.lastActivity = new Date();
    
    this.setupProcessHandlers();
    this.logger.info('Server lifecycle manager initialized');
  }

  /**
   * Set up process signal handlers for graceful shutdown
   */
  private setupProcessHandlers(): void {
    // Handle graceful shutdown signals
    process.on('SIGTERM', () => this.handleShutdownSignal('SIGTERM'));
    process.on('SIGINT', () => this.handleShutdownSignal('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.logger.error('Uncaught exception', error, { fatal: true });
      this.gracefulShutdown(1);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any) => {
      this.logger.error('Unhandled promise rejection', new Error(String(reason)), {
        fatal: true
      });
      this.gracefulShutdown(1);
    });
    
    // Log warnings for potential issues
    process.on('warning', (warning: Error) => {
      this.logger.warn('Process warning', { warning: warning.message, stack: warning.stack });
    });
  }

  /**
   * Handle shutdown signals
   */
  private async handleShutdownSignal(signal: string): Promise<void> {
    this.logger.info(`Received ${signal}, initiating graceful shutdown`);
    await this.gracefulShutdown(0);
  }

  /**
   * Perform graceful shutdown
   */
  async gracefulShutdown(exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress, ignoring additional shutdown request');
      return;
    }
    
    this.isShuttingDown = true;
    this.logger.info('Starting graceful shutdown sequence');
    
    // Set a timeout to force exit if graceful shutdown takes too long
    const forceExitTimer = setTimeout(() => {
      this.logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // Run all shutdown handlers
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          this.logger.error('Error in shutdown handler', error as Error);
        }
      }
      
      this.logger.info('Graceful shutdown completed successfully');
    } catch (error) {
      this.logger.error('Error during graceful shutdown', error as Error);
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(exitCode);
    }
  }

  /**
   * Register a shutdown handler
   */
  onShutdown(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Check if server is shutting down
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Record a request
   */
  recordRequest(): void {
    this.requestCount++;
    this.lastActivity = new Date();
  }

  /**
   * Record an error
   */
  recordError(): void {
    this.errorCount++;
    this.lastActivity = new Date();
  }

  /**
   * Get server metrics
   */
  getMetrics(): ServerMetrics {
    const memUsage = process.memoryUsage();
    
    return {
      uptime: Date.now() - this.startTime.getTime(),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastActivity: this.lastActivity,
      memoryUsage: {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      }
    };
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const result: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date(),
      version: '2.0.0',
      uptime: Date.now() - this.startTime.getTime(),
      checks: {}
    };

    // Memory check
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    
    if (memUsageMB > 500) {
      result.checks.memory = { status: 'warning', message: `High memory usage: ${memUsageMB.toFixed(2)}MB` };
      result.status = 'degraded';
    } else if (memUsageMB > 1000) {
      result.checks.memory = { status: 'error', message: `Critical memory usage: ${memUsageMB.toFixed(2)}MB` };
      result.status = 'unhealthy';
    } else {
      result.checks.memory = { status: 'ok', message: `Memory usage: ${memUsageMB.toFixed(2)}MB` };
    }

    // Uptime check
    const uptimeHours = result.uptime / (1000 * 60 * 60);
    result.checks.uptime = { 
      status: 'ok', 
      message: `Server uptime: ${uptimeHours.toFixed(2)} hours` 
    };

    // Event loop lag check (simplified)
    const eventLoopStart = Date.now();
    await new Promise(resolve => setImmediate(resolve));
    const eventLoopLag = Date.now() - eventLoopStart;
    
    if (eventLoopLag > 100) {
      result.checks.eventLoop = { status: 'warning', message: `High event loop lag: ${eventLoopLag}ms` };
      result.status = 'degraded';
    } else if (eventLoopLag > 500) {
      result.checks.eventLoop = { status: 'error', message: `Critical event loop lag: ${eventLoopLag}ms` };
      result.status = 'unhealthy';
    } else {
      result.checks.eventLoop = { status: 'ok', message: `Event loop lag: ${eventLoopLag}ms` };
    }

    // Error rate check
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;
    if (errorRate > 10) {
      result.checks.errors = { status: 'warning', message: `High error rate: ${errorRate.toFixed(2)}%` };
      result.status = 'degraded';
    } else if (errorRate > 25) {
      result.checks.errors = { status: 'error', message: `Critical error rate: ${errorRate.toFixed(2)}%` };
      result.status = 'unhealthy';
    } else {
      result.checks.errors = { status: 'ok', message: `Error rate: ${errorRate.toFixed(2)}%` };
    }

    // Check if shutting down
    if (this.isShuttingDown) {
      result.checks.shutdown = { status: 'warning', message: 'Server is shutting down' };
      result.status = 'degraded';
    }

    const totalTime = Date.now() - startTime;
    this.logger.debug('Health check completed', { 
      status: result.status, 
      duration: totalTime,
      checks: Object.keys(result.checks).length 
    });

    return result;
  }

  /**
   * Start periodic health monitoring
   */
  startHealthMonitoring(intervalMs: number = 60000): void {
    const interval = setInterval(async () => {
      if (this.isShuttingDown) {
        clearInterval(interval);
        return;
      }

      try {
        const health = await this.performHealthCheck();
        if (health.status !== 'healthy') {
          this.logger.warn('Health check detected issues', { health });
        }
      } catch (error) {
        this.logger.error('Health check failed', error as Error);
      }
    }, intervalMs);

    // Register shutdown handler to clear interval
    this.onShutdown(async () => {
      clearInterval(interval);
    });

    this.logger.info('Health monitoring started', { intervalMs });
  }

  /**
   * Get basic server info
   */
  getServerInfo() {
    return {
      version: '2.0.0',
      name: 'universal-bob-the-fixer',
      startTime: this.startTime.toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid
    };
  }
}

// Singleton instance
let lifecycleManager: ServerLifecycleManager | null = null;

/**
 * Get the global lifecycle manager instance
 */
export function getLifecycleManager(): ServerLifecycleManager {
  lifecycleManager ??= new ServerLifecycleManager();
  return lifecycleManager;
}