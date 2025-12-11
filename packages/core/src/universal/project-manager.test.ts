import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectManager, ProjectConfig } from './project-manager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ProjectManager', () => {
  let tempDir: string;
  let manager: ProjectManager;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bob-test-'));
    manager = new ProjectManager();
    manager.setWorkingDirectory(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('ProjectConfig forceCliScanner', () => {
    // Helper to get a recent date (within 30 days)
    const getRecentDate = () => new Date().toISOString();

    it('should save and load forceCliScanner property', async () => {
      // Create a config file manually with forceCliScanner
      const configPath = path.join(tempDir, 'bobthefixer.env');
      const content = [
        'SONAR_URL=http://localhost:9000',
        'SONAR_TOKEN=test-token',
        'SONAR_PROJECT_KEY=test-key',
        `CREATED_AT=${getRecentDate()}`,
        'FORCE_CLI_SCANNER=true'
      ].join('\n');

      await fs.writeFile(configPath, content, 'utf-8');

      const loaded = await manager.getOrCreateConfig();

      expect(loaded.forceCliScanner).toBe(true);
    });

    it('should load forceCliScanner as false when set to false', async () => {
      const configPath = path.join(tempDir, 'bobthefixer.env');
      const content = [
        'SONAR_URL=http://localhost:9000',
        'SONAR_TOKEN=test-token',
        'SONAR_PROJECT_KEY=test-key',
        `CREATED_AT=${getRecentDate()}`,
        'FORCE_CLI_SCANNER=false'
      ].join('\n');

      await fs.writeFile(configPath, content, 'utf-8');

      const loaded = await manager.getOrCreateConfig();

      expect(loaded.forceCliScanner).toBe(false);
    });

    it('should have undefined forceCliScanner when not present in file', async () => {
      const configPath = path.join(tempDir, 'bobthefixer.env');
      const content = [
        'SONAR_URL=http://localhost:9000',
        'SONAR_TOKEN=test-token',
        'SONAR_PROJECT_KEY=test-key',
        `CREATED_AT=${getRecentDate()}`
      ].join('\n');

      await fs.writeFile(configPath, content, 'utf-8');

      const loaded = await manager.getOrCreateConfig();

      expect(loaded.forceCliScanner).toBeUndefined();
    });

    it('should write FORCE_CLI_SCANNER to env file when saving config', async () => {
      // First create the file so saveConfig won't fail
      const configPath = path.join(tempDir, 'bobthefixer.env');
      const initialContent = [
        'SONAR_URL=http://localhost:9000',
        'SONAR_TOKEN=test-token',
        'SONAR_PROJECT_KEY=test-key',
        'CREATED_AT=2024-01-01T00:00:00.000Z'
      ].join('\n');
      await fs.writeFile(configPath, initialContent, 'utf-8');

      // Call saveConfig with forceCliScanner
      const configToSave: ProjectConfig = {
        sonarUrl: 'http://localhost:9000',
        sonarToken: 'test-token',
        sonarProjectKey: 'test-key',
        createdAt: new Date().toISOString(),
        forceCliScanner: true
      };

      // Use the private method via any cast (testing internal behavior)
      await (manager as any).saveConfig(configPath, configToSave);

      const content = await fs.readFile(configPath, 'utf-8');
      expect(content).toContain('FORCE_CLI_SCANNER=true');
    });

    it('should not write FORCE_CLI_SCANNER when undefined', async () => {
      const configPath = path.join(tempDir, 'bobthefixer.env');

      const configToSave: ProjectConfig = {
        sonarUrl: 'http://localhost:9000',
        sonarToken: 'test-token',
        sonarProjectKey: 'test-key',
        createdAt: new Date().toISOString()
        // forceCliScanner is undefined
      };

      await (manager as any).saveConfig(configPath, configToSave);

      const content = await fs.readFile(configPath, 'utf-8');
      expect(content).not.toContain('FORCE_CLI_SCANNER');
    });

    it('should parse boolean string correctly', async () => {
      const configPath = path.join(tempDir, 'bobthefixer.env');
      const content = [
        'SONAR_URL=http://localhost:9000',
        'SONAR_TOKEN=test-token',
        'SONAR_PROJECT_KEY=test-key',
        `CREATED_AT=${getRecentDate()}`,
        'FORCE_CLI_SCANNER=true'
      ].join('\n');

      await fs.writeFile(configPath, content, 'utf-8');

      const loaded = await manager.getOrCreateConfig();

      // Should be boolean true, not string 'true'
      expect(loaded.forceCliScanner).toBe(true);
      expect(typeof loaded.forceCliScanner).toBe('boolean');
    });
  });
});
