/**
 * Trivy SBOM generation.
 *
 * Runs `trivy fs --format <cyclonedx|spdx-json>` via execFile (no shell) to
 * produce a Software Bill of Materials, writes it to a file, and returns a
 * summary (format, output path, component count). SBOM is an inventory
 * operation, kept separate from the IScanner scan-for-issues path.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import * as path from 'path';
import { INSTALL_HINT } from './TrivyScanner.js';

const execFileAsync = promisify(execFile);

export type SbomFormat = 'cyclonedx' | 'spdx-json';

const FORMATS: readonly SbomFormat[] = ['cyclonedx', 'spdx-json'];
const DEFAULT_FILENAME: Record<SbomFormat, string> = {
  cyclonedx: 'sbom.cyclonedx.json',
  'spdx-json': 'sbom.spdx.json',
};

export interface GenerateSbomOptions {
  projectPath: string;
  format?: SbomFormat;
  outputPath?: string;
}

export interface SbomResult {
  format: SbomFormat;
  outputPath: string;
  componentCount?: number;
  spec?: string;
}

export async function generateSbom(opts: GenerateSbomOptions): Promise<SbomResult> {
  const format = opts.format ?? 'cyclonedx';
  if (!FORMATS.includes(format)) {
    throw new Error(`Unsupported SBOM format '${format}'. Use one of: ${FORMATS.join(', ')}.`);
  }
  const outputPath = opts.outputPath ?? path.join(opts.projectPath, DEFAULT_FILENAME[format]);

  let stdout: string;
  try {
    const res = await execFileAsync(
      'trivy',
      // `--` terminates flag parsing so a path starting with `-` can't be
      // smuggled as a Trivy flag (argv injection).
      ['fs', '--quiet', '--format', format, '--', opts.projectPath],
      { maxBuffer: 64 * 1024 * 1024 }
    );
    stdout = res.stdout;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new Error(INSTALL_HINT);
    }
    const stderr = (error as { stderr?: string })?.stderr;
    throw new Error(`Trivy SBOM generation failed: ${stderr || (error as Error).message}`);
  }

  await writeFile(outputPath, stdout, 'utf8');
  return { format, outputPath, ...summarize(stdout, format) };
}

/** Best-effort summary; a malformed SBOM yields an empty (degraded) summary. */
function summarize(sbom: string, format: SbomFormat): { componentCount?: number; spec?: string } {
  try {
    const doc = JSON.parse(sbom);
    if (format === 'cyclonedx') {
      return {
        componentCount: Array.isArray(doc.components) ? doc.components.length : undefined,
        spec: doc.specVersion,
      };
    }
    return {
      componentCount: Array.isArray(doc.packages) ? doc.packages.length : undefined,
      spec: doc.spdxVersion,
    };
  } catch {
    return {};
  }
}
