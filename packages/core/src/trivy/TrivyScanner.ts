/**
 * Trivy Scanner
 *
 * IScanner implementation for SCA (dependency vulnerabilities) via the Trivy
 * CLI. This is a thin wrapper: it runs `trivy fs` through execFile with an
 * argument array (no shell, so the scanned path cannot inject commands) and
 * delegates parsing to the pure TrivyResultParser.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { ScannerHealthStatus, BaseScannerImpl } from '../scanners/IScanner.js';
import { IScanResult, ScanParams } from '../scanners/IScanResult.js';
import { TrivyResultParser } from './trivy-parser.js';
import { collectImportedPackages } from './source-imports.js';
import { classifyReachability } from './reachability.js';

const execFileAsync = promisify(execFile);

export const INSTALL_HINT =
  'Trivy is not installed or not found on PATH. Install it: https://trivy.dev/docs/getting-started/installation/';

export class TrivyScanner extends BaseScannerImpl {
  readonly name = 'trivy';
  readonly type = 'sca' as const;

  private readonly parser = new TrivyResultParser();
  private readonly timeoutMs = 5 * 60 * 1000;
  private readonly maxBuffer = 64 * 1024 * 1024;

  async scan(params: ScanParams): Promise<IScanResult> {
    const startedAt = new Date().toISOString();
    // No --exit-code: finding vulnerabilities is a successful scan, not an error.
    // `--` terminates flag parsing so a path starting with `-` can't be
    // smuggled as a Trivy flag (argv injection).
    const args = ['fs', '--quiet', '--list-all-pkgs', '--format', 'json', '--scanners', 'vuln', '--', params.projectPath];

    let stdout: string;
    try {
      const res = await execFileAsync('trivy', args, {
        timeout: this.timeoutMs,
        maxBuffer: this.maxBuffer,
      });
      stdout = res.stdout;
    } catch (error) {
      if (isNotFound(error)) {
        throw new Error(INSTALL_HINT);
      }
      const detail = stderrOf(error) || messageOf(error);
      throw new Error(`Trivy scan failed: ${detail}`);
    }

    const result = this.parser.parse(stdout, {
      projectPath: params.projectPath,
      projectKey: params.projectKey,
      projectName: params.projectName,
      scanId: this.generateScanId(),
      startedAt,
    });

    // Enrich each finding with an import-presence reachability signal.
    const imported = await collectImportedPackages(params.projectPath);
    for (const issue of result.issues) {
      if (issue.dependency) {
        issue.dependency.reachability = classifyReachability(issue.dependency, imported);
      }
    }
    return result;
  }

  async checkHealth(): Promise<ScannerHealthStatus> {
    const lastChecked = new Date().toISOString();
    try {
      const res = await execFileAsync('trivy', ['--version']);
      return { available: true, version: parseVersion(res.stdout), lastChecked };
    } catch (error) {
      return {
        available: false,
        errorMessage: isNotFound(error) ? INSTALL_HINT : messageOf(error),
        lastChecked,
      };
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ENOENT';
}
function stderrOf(error: unknown): string {
  const s = (error as { stderr?: string })?.stderr;
  return typeof s === 'string' ? s : '';
}
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function parseVersion(stdout: string): string | undefined {
  const m = stdout.match(/Version:\s*v?([\d][\d.]*)/i) ?? stdout.match(/v?(\d+\.\d+\.\d+)/);
  return m?.[1];
}
