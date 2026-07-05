/**
 * SonarQube Source Fetcher
 *
 * Fetches source context/lines from a SonarQube instance, with a per-instance
 * raw-source cache. Extracted verbatim from SonarQubeClient: depends only on
 * the Axios client (no project key, token, or scanner concerns).
 */

import { AxiosInstance } from 'axios';
import { SonarLineCoverage } from '../types';

export class SonarSourceFetcher {
  private rawSourceLinesCache: Map<string, string[]> = new Map();

  constructor(private readonly client: AxiosInstance) {}

  async getSourceContext(
    component: string,
    line: number,
    contextLines: number = 5
  ): Promise<string> {
    try {
      const safeLine = Math.max(1, line);
      const safeContext = Math.max(0, contextLines);
      const from = Math.max(1, safeLine - safeContext);
      const to = safeLine + safeContext;

      const lines = await this.getSourceLines(component, from, to, { bestEffort: true });
      if (!Array.isArray(lines) || lines.length === 0) return '';
      return lines.map(l => l.code ?? '').join('\n');
    } catch (error: any) {
      // Best-effort: return empty string if sources cannot be fetched
      console.warn(`Failed to fetch source context for ${component}:`, error.message);
      return '';
    }
  }

  /**
   * Fetch source lines for a specific range.
   * Best-effort mode returns an empty array on errors.
   */
  async getSourceLines(
    componentKey: string,
    from: number,
    to: number,
    options?: { bestEffort?: boolean }
  ): Promise<SonarLineCoverage[]> {
    const safeFrom = Math.max(1, from);
    const safeTo = Math.max(safeFrom, to);

    // Prefer range-based plain text when available (internal endpoint, but stable across many SonarQube versions)
    try {
      const indexLines = await this.getSourceLinesFromIndex(componentKey, safeFrom, safeTo);
      if (Array.isArray(indexLines) && indexLines.length > 0) return indexLines as SonarLineCoverage[];
    } catch (error: any) {
      // Fall back to raw-file download + slicing
    }

    try {
      const fileLines = await this.getRawFileLines(componentKey);
      if (fileLines.length === 0) return [];

      const startIndex = Math.max(0, safeFrom - 1);
      const endIndex = Math.min(fileLines.length, safeTo);
      const slice = fileLines.slice(startIndex, endIndex);

      return slice.map((code, idx) => ({
        line: safeFrom + idx,
        code
      })) as SonarLineCoverage[];
    } catch (error: any) {
      if (options?.bestEffort) {
        console.warn(`Failed to fetch source lines for ${componentKey}:`, error.message);
        return [];
      }
      throw error;
    }
  }

  private async getSourceLinesFromIndex(
    componentKey: string,
    from: number,
    to: number
  ): Promise<Array<{ line: number; code: string }>> {
    const safeFrom = Math.max(1, from);
    const safeTo = Math.max(safeFrom, to);

    const response = await this.client.get('/api/sources/index', {
      params: {
        resource: componentKey,
        from: safeFrom,
        // `to` is excluded on this endpoint, so ask for (inclusive + 1)
        to: safeTo + 1
      }
    });

    const data = response.data;
    const lines: Array<{ line: number; code: string }> = [];

    const collectFromObject = (obj: Record<string, unknown>) => {
      for (const [lineStr, codeVal] of Object.entries(obj)) {
        const lineNumber = Number(lineStr);
        if (!Number.isFinite(lineNumber)) continue;
        if (lineNumber < safeFrom || lineNumber > safeTo) continue;
        lines.push({
          line: lineNumber,
          code: typeof codeVal === 'string' ? codeVal : ''
        });
      }
    };

    if (Array.isArray(data)) {
      for (const block of data) {
        if (!block || typeof block !== 'object') continue;
        collectFromObject(block as Record<string, unknown>);
      }
    } else if (data && typeof data === 'object') {
      collectFromObject(data as Record<string, unknown>);
    }

    lines.sort((a, b) => a.line - b.line);
    return lines;
  }

  private async getRawFileLines(componentKey: string): Promise<string[]> {
    const cached = this.rawSourceLinesCache.get(componentKey);
    if (cached) return cached;

    const response = await this.client.get('/api/sources/raw', {
      params: { key: componentKey },
      responseType: 'text'
    });

    const raw = typeof response.data === 'string' ? response.data : '';
    const lines = raw ? raw.split('\n') : [];
    this.rawSourceLinesCache.set(componentKey, lines);
    return lines;
  }
}
