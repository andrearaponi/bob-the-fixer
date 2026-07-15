import { describe, it, expect, vi } from 'vitest';

// The version checker is consulted per-call for the update banner; stub it out.
vi.mock('../shared/version/index.js', () => ({ getVersionChecker: () => undefined }));

// Stub the scan handler so routing can be exercised without hitting SonarQube.
vi.mock('./handlers/scan.handler.js', () => ({
  handleScanProject: vi.fn(async () => ({ content: [{ type: 'text', text: 'ROUTED-SCAN' }] })),
}));

import { routeTool, toolExists, getAvailableTools, toolRoutes } from './ToolRouter.js';

describe('ToolRouter (single wiring table)', () => {
  it('exposes exactly the registered tools including the sonar and trivy tools', () => {
    const tools = getAvailableTools();
    expect(tools).toContain('sonar_scan_project');
    expect(tools).toContain('trivy_scan_dependencies');
    expect(tools).toContain('trivy_check_installation');
    expect(tools).toContain('sonar_transition_issue');
    expect(tools).toContain('sonar_comment_issue');
    expect(tools).toContain('sonar_change_hotspot_status');
    expect(tools).toHaveLength(Object.keys(toolRoutes).length);
    // 21 read/scan sonar tools + 3 trivy (SCA/SBOM) tools + 3 sonar mutation tools.
    expect(tools).toHaveLength(27);
  });

  it('reports tool existence', () => {
    expect(toolExists('sonar_scan_project')).toBe(true);
    expect(toolExists('sonar_get_issue_details')).toBe(true);
    expect(toolExists('does_not_exist')).toBe(false);
  });

  it('routes a known tool to its mapped handler', async () => {
    const result = await routeTool('sonar_scan_project', {});
    expect(result.content[0].text).toContain('ROUTED-SCAN');
  });

  it('throws an actionable error for an unknown tool', async () => {
    await expect(routeTool('nope', {})).rejects.toThrow('Unknown tool: nope');
  });
});
