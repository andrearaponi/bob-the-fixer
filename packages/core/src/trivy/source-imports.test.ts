import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { collectImportedPackages } from './source-imports.js';

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'srcimp-'));
  await fs.writeFile(
    path.join(dir, 'a.ts'),
    [
      "import axios from 'axios';",
      "import { z } from 'zod/lib';",
      "import { Client } from '@modelcontextprotocol/sdk/client';",
      "import './local-module';",
      "const l = require('lodash/merge');",
    ].join('\n')
  );
  // node_modules must be skipped
  await fs.mkdir(path.join(dir, 'node_modules', 'evil'), { recursive: true });
  await fs.writeFile(path.join(dir, 'node_modules', 'evil', 'index.js'), "require('should-be-skipped');");
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('collectImportedPackages', () => {
  it('R1.AC1/R1.AC2: extracts and normalizes package names (subpath, scope, require)', async () => {
    const set = await collectImportedPackages(dir);
    expect(set.has('axios')).toBe(true);
    expect(set.has('zod')).toBe(true); // zod/lib -> zod
    expect(set.has('@modelcontextprotocol/sdk')).toBe(true); // scope+name
    expect(set.has('lodash')).toBe(true); // require, lodash/merge -> lodash
  });

  it('R1.AC2: ignores relative imports', async () => {
    const set = await collectImportedPackages(dir);
    expect([...set].some((p) => p.startsWith('.'))).toBe(false);
  });

  it('NFR2: skips node_modules', async () => {
    const set = await collectImportedPackages(dir);
    expect(set.has('should-be-skipped')).toBe(false);
  });

  it('R1.AC3: a missing directory yields an empty set, not a throw', async () => {
    const set = await collectImportedPackages(path.join(dir, 'does-not-exist'));
    expect(set.size).toBe(0);
  });
});
