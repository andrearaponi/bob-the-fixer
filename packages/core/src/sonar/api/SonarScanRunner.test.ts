import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SonarScanRunner } from './SonarScanRunner.js';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve('')),
  writeFile: vi.fn(() => Promise.resolve()),
  unlink: vi.fn(() => Promise.resolve()),
  stat: vi.fn(() => Promise.resolve({})),
  access: vi.fn(() => Promise.resolve()),
}));

describe('SonarScanRunner', () => {
  let get: ReturnType<typeof vi.fn>;
  let runner: SonarScanRunner;

  beforeEach(() => {
    get = vi.fn();
    runner = new SonarScanRunner({ get } as any, 'test-project');
  });

  it('R2.AC1: checkTaskStatus polls the CE task by id when a ceTaskId is provided', async () => {
    get.mockResolvedValueOnce({ data: { task: { status: 'IN_PROGRESS', type: 'REPORT' } } });

    const task = await (runner as any).checkTaskStatus('AX-task-123');

    expect(get).toHaveBeenCalledWith('/api/ce/task', { params: { id: 'AX-task-123' } });
    expect(task.status).toBe('IN_PROGRESS');
  });

  it('R2.AC1: checkTaskStatus falls back to ce/activity when no ceTaskId is given', async () => {
    get.mockResolvedValueOnce({ data: { tasks: [{ status: 'SUCCESS', type: 'REPORT' }] } });

    await (runner as any).checkTaskStatus();

    expect(get).toHaveBeenCalledWith(
      '/api/ce/activity',
      expect.objectContaining({ params: expect.objectContaining({ component: 'test-project' }) })
    );
  });

  it('R2.AC1: readCeTaskId parses ceTaskId from report-task.txt', async () => {
    const fsp = await import('fs/promises');
    vi.mocked(fsp.readFile).mockResolvedValueOnce(
      'projectKey=p\nceTaskId=AX-abc-999\nserverUrl=http://x' as any
    );

    expect(await runner.readCeTaskId('/repo')).toBe('AX-abc-999');
  });

  it('R2.AC1: readCeTaskId returns null when report-task.txt is absent', async () => {
    const fsp = await import('fs/promises');
    vi.mocked(fsp.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) as any
    );

    expect(await runner.readCeTaskId('/repo')).toBeNull();
  });

  it('R2.AC2: getLastBuiltScannerParams starts empty and setScannerOptions is accepted', () => {
    expect(runner.getLastBuiltScannerParams()).toEqual([]);

    runner.setScannerOptions({ forceCliScanner: true });

    // options are stored for the next trigger; no params built yet
    expect(runner.getLastBuiltScannerParams()).toEqual([]);
  });
});
