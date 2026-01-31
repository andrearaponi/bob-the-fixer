/**
 * Dependency Injection Container
 *
 * Central configuration for the DI container using TSyringe.
 * This module sets up all the dependency registrations.
 */

import 'reflect-metadata';
import { container, DependencyContainer } from 'tsyringe';
import { TOKENS } from './tokens.js';
import { sanitizeUrl } from '../security/input-sanitization.js';

// Export the container instance for use throughout the application
export { container };
export type { DependencyContainer };

/**
 * Configuration options for container setup
 */
export interface ContainerConfig {
  sonarUrl?: string;
  sonarToken?: string;
  projectPath?: string;
}

/**
 * Initialize the DI container with all dependencies
 *
 * This function registers all services, repositories, and infrastructure
 * components with the container. It should be called once at application startup.
 */
export function initializeContainer(config: ContainerConfig = {}): DependencyContainer {
  // Register configuration
  container.register(TOKENS.Config, { useValue: config });

  // Get SonarQube configuration from environment or config
  const sonarUrl = sanitizeUrl(config.sonarUrl ?? process.env.SONAR_URL ?? 'http://localhost:9000');
  const sonarToken = config.sonarToken ?? process.env.SONAR_TOKEN;
  const projectPath = config.projectPath ?? process.cwd();

  // Register ProjectManager (lazy import to avoid circular dependencies)
  container.register(TOKENS.ProjectManager, {
    useFactory: () => {
      // Dynamic import to avoid module loading issues
      const { ProjectManager } = require('../../universal/project-manager.js');
      return new ProjectManager(projectPath);
    },
  });

  // Register SonarAdmin (lazy import to avoid circular dependencies)
  container.register(TOKENS.SonarAdmin, {
    useFactory: () => {
      const { SonarAdmin } = require('../../universal/sonar-admin.js');
      return new SonarAdmin(sonarUrl, sonarToken);
    },
  });

  // Register SessionManager
  container.register(TOKENS.SessionManager, {
    useFactory: () => {
      const { SessionManager } = require('../../universal/http/session-manager.js');
      return new SessionManager();
    },
  });

  // Register HTTP Server (lazy import to avoid circular dependencies)
  container.register(TOKENS.HTTPServer, {
    useFactory: (c) => {
      const { MCPHTTPServer } = require('../../universal/http/http-server.js');
      const projectManager = c.resolve(TOKENS.ProjectManager);
      return new MCPHTTPServer({}, projectManager);
    },
  });

  return container;
}

/**
 * Create a child container for scoped dependencies
 *
 * Useful for request-scoped or session-scoped dependencies
 */
export function createChildContainer(): DependencyContainer {
  return container.createChildContainer();
}

/**
 * Clear all registrations from the container
 *
 * Primarily used for testing purposes
 */
export function clearContainer(): void {
  container.clearInstances();
}

/**
 * Check if a token is registered in the container
 */
export function isRegistered(token: symbol): boolean {
  return container.isRegistered(token);
}

/**
 * Resolve a dependency from the container
 *
 * @param token - The token identifying the dependency
 * @returns The resolved dependency instance
 */
export function resolve<T>(token: symbol): T {
  return container.resolve<T>(token);
}

/**
 * Register a singleton instance
 */
export function registerSingleton<T>(token: symbol, instance: T): void {
  container.register(token, { useValue: instance });
}

/**
 * Register a factory function
 */
export function registerFactory<T>(
  token: symbol,
  factory: (container: DependencyContainer) => T
): void {
  container.register(token, { useFactory: factory });
}
