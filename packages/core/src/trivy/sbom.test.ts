import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

// Controllable execFile mock: tests set `h.impl` to a result or an Error.
const h: { impl: (file: string, args: string[]) => { stdout?: string; stderr?: string } | Error } = {
  impl: () => ({ stdout: '{}' }),
};
vi.mock('child_process', () => ({
  execFile: (file: string, args: string[], options: unknown, cb: unknown) => {
    const callback = (typeof options === 'function' ? options : cb) as (
      err: unknown,
      res?: { stdout: string; stderr: string }
    ) => void;
    const r = h.impl(file, args);
    if (r instanceof Error) callback(r);
    else callback(null, { stdout: r.stdout ?? '', stderr: r.stderr ?? '' });
  },
}));

import { generateSbom } from './sbom.js';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sbom-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('generateSbom', () => {
  it('R1.AC2/R2.AC1: defaults to cyclonedx, writes to the default path, counts components', async () => {
    h.impl = () => ({
      stdout: JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5', components: [{}, {}, {}] }),
    });

    const res = await generateSbom({ projectPath: dir });

    expect(res.format).toBe('cyclonedx');
    expect(res.outputPath.endsWith('sbom.cyclonedx.json')).toBe(true);
    expect(res.componentCount).toBe(3);
    expect(res.spec).toBe('1.5');
    expect(await fs.readFile(res.outputPath, 'utf8')).toContain('CycloneDX');
  });

  it('R1.AC1: spdx-json counts packages', async () => {
    h.impl = () => ({ stdout: JSON.stringify({ spdxVersion: 'SPDX-2.3', packages: [{}, {}] }) });

    const res = await generateSbom({ projectPath: dir, format: 'spdx-json', outputPath: path.join(dir, 's.json') });

    expect(res.format).toBe('spdx-json');
    expect(res.componentCount).toBe(2);
    expect(res.spec).toBe('SPDX-2.3');
  });

  it('R1.AC4: rejects an unsupported format before invoking Trivy', async () => {
    let called = false;
    h.impl = () => {
      called = true;
      return { stdout: '{}' };
    };

    await expect(generateSbom({ projectPath: dir, format: 'bogus' as never })).rejects.toThrow(/Unsupported SBOM format/);
    expect(called).toBe(false);
  });

  it('R1.AC3: ENOENT yields the install hint', async () => {
    h.impl = () => Object.assign(new Error('spawn trivy ENOENT'), { code: 'ENOENT' });

    await expect(generateSbom({ projectPath: dir, outputPath: path.join(dir, 'x.json') })).rejects.toThrow(/install/i);
  });

  it('R2.AC3: an unparseable SBOM still writes the file with a degraded summary', async () => {
    h.impl = () => ({ stdout: 'not json{' });
    const out = path.join(dir, 'bad.json');

    const res = await generateSbom({ projectPath: dir, outputPath: out });

    expect(res.componentCount).toBeUndefined();
    expect(await fs.readFile(out, 'utf8')).toBe('not json{');
  });
});
