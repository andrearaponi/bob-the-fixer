import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  container,
  initializeContainer,
  createChildContainer,
  clearContainer,
  isRegistered,
  resolve,
  registerSingleton,
  registerFactory,
} from './container.js';
import { TOKENS } from './tokens.js';

describe('DI Container', () => {
  beforeEach(() => {
    clearContainer();
  });

  afterEach(() => {
    clearContainer();
  });

  describe('initializeContainer', () => {
    it('should initialize container with default config', () => {
      const result = initializeContainer();
      expect(result).toBeDefined();
      expect(result).toBe(container);
    });

    it('should register config in container', () => {
      const config = {
        sonarUrl: 'http://localhost:9000',
        sonarToken: 'test-token',
        projectPath: '/test/path',
      };

      initializeContainer(config);

      const resolvedConfig = resolve(TOKENS.Config);
      expect(resolvedConfig).toEqual(config);
    });

    it('should handle empty config', () => {
      initializeContainer({});
      const resolvedConfig = resolve(TOKENS.Config);
      expect(resolvedConfig).toEqual({});
    });
  });

  describe('createChildContainer', () => {
    it('should create a child container', () => {
      initializeContainer();
      const child = createChildContainer();

      expect(child).toBeDefined();
      expect(child).not.toBe(container);
    });

    it('should inherit parent registrations', () => {
      const config = { sonarUrl: 'http://test:9000' };
      initializeContainer(config);

      const child = createChildContainer();
      const resolvedConfig = child.resolve(TOKENS.Config);

      expect(resolvedConfig).toEqual(config);
    });
  });

  describe('registerSingleton', () => {
    it('should register a singleton value', () => {
      const testService = { name: 'TestService', run: () => 'result' };
      const testToken = Symbol.for('TestService');

      registerSingleton(testToken, testService);

      const resolved = resolve(testToken);
      expect(resolved).toBe(testService);
    });

    it('should return same instance on multiple resolves', () => {
      const testToken = Symbol.for('TestSingleton');
      const instance = { id: Math.random() };

      registerSingleton(testToken, instance);

      const first = resolve(testToken);
      const second = resolve(testToken);

      expect(first).toBe(second);
      expect(first).toBe(instance);
    });
  });

  describe('registerFactory', () => {
    it('should register a factory function', () => {
      const testToken = Symbol.for('FactoryService');
      let callCount = 0;

      registerFactory(testToken, () => {
        callCount++;
        return { callNumber: callCount };
      });

      const first = resolve<{ callNumber: number }>(testToken);
      const second = resolve<{ callNumber: number }>(testToken);

      // Factory is called each time (transient by default)
      expect(first.callNumber).toBe(1);
      expect(second.callNumber).toBe(2);
    });

    it('should have access to container in factory', () => {
      const configToken = Symbol.for('FactoryConfig');
      const serviceToken = Symbol.for('FactoryServiceWithConfig');

      registerSingleton(configToken, { url: 'http://test' });
      registerFactory(serviceToken, (c) => {
        const config = c.resolve<{ url: string }>(configToken);
        return { configUrl: config.url };
      });

      const service = resolve<{ configUrl: string }>(serviceToken);
      expect(service.configUrl).toBe('http://test');
    });
  });

  describe('isRegistered', () => {
    it('should return false for unregistered token', () => {
      const unknownToken = Symbol.for('UnknownService');
      expect(isRegistered(unknownToken)).toBe(false);
    });

    it('should return true for registered token', () => {
      initializeContainer({ sonarUrl: 'http://test' });
      expect(isRegistered(TOKENS.Config)).toBe(true);
    });
  });

  describe('clearContainer', () => {
    it('should clear cached instances for reinitialization', () => {
      // clearInstances() resets the container state
      // This is primarily useful for testing between test cases
      initializeContainer({ sonarUrl: 'http://test1' });

      const configBefore = resolve(TOKENS.Config);
      expect(configBefore).toEqual({ sonarUrl: 'http://test1' });

      clearContainer();

      // Re-initialize with different config
      initializeContainer({ sonarUrl: 'http://test2' });

      const configAfter = resolve(TOKENS.Config);
      expect(configAfter).toEqual({ sonarUrl: 'http://test2' });
    });
  });
});

describe('TOKENS', () => {
  it('should have unique symbols for each token', () => {
    const tokenValues = Object.values(TOKENS);
    const uniqueValues = new Set(tokenValues);

    expect(uniqueValues.size).toBe(tokenValues.length);
  });

  it('should have all required scanner tokens', () => {
    expect(TOKENS.Scanner).toBeDefined();
    expect(TOKENS.Scanners).toBeDefined();
    expect(TOKENS.SonarQubeScanner).toBeDefined();
    expect(TOKENS.TrivyScanner).toBeDefined();
  });

  it('should have all required repository tokens', () => {
    expect(TOKENS.ScanRepository).toBeDefined();
    expect(TOKENS.IssueRepository).toBeDefined();
  });

  it('should have all required service tokens', () => {
    expect(TOKENS.IssueAnalyzer).toBeDefined();
    expect(TOKENS.CoverageAnalyzer).toBeDefined();
    expect(TOKENS.QualityAnalyzer).toBeDefined();
    expect(TOKENS.SecurityAnalyzer).toBeDefined();
    expect(TOKENS.UnifiedSecurityService).toBeDefined();
  });
});
