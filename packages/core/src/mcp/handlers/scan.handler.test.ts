import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleScanProject, ScanHandler } from './scan.handler';

// Hoisted scanner mock so vi.mock factory can reference it.
const { mockScan } = vi.hoisted(() => ({ mockScan: vi.fn() }));

// The handler routes the scan through SonarQubeScanner (IScanner seam).
vi.mock('../../sonar/scanner/index.js', () => ({
  SonarQubeScanner: class {
    scan = mockScan;
  },
}));

vi.mock('../../core/scanning/index.js');
vi.mock('../../core/scanning/fallback/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../universal/sonar-admin');
vi.mock('../../shared/validators/mcp-schemas');
vi.mock('../../infrastructure/security/input-sanitization');

// The native Sonar ScanResult carried in rawOutput; content is opaque here
// because the text formatter is mocked.
const fakeRawOutput = { projectKey: 'test-project', totalIssues: 5 };

async function setupCommon() {
  const validators = await import('../../shared/validators/mcp-schemas');
  const mockValidateInput = vi.mocked(validators.validateInput);
  mockValidateInput.mockImplementation(() => ({
    projectPath: '/test/project',
    severityFilter: ['CRITICAL'],
    typeFilter: ['BUG'],
    autoSetup: false,
  }));

  const security = await import('../../infrastructure/security/input-sanitization');
  vi.mocked(security.sanitizeUrl).mockImplementation(() => 'http://localhost:9000');

  const scanning = await import('../../core/scanning/index.js');
  vi.mocked(scanning.ScanResultProcessor.formatAsTextSummary).mockImplementation(
    () => 'SONARQUBE ANALYSIS RESULTS\n\nProject: test-project\nTotal Issues: 5'
  );

  mockScan.mockResolvedValue({ rawOutput: fakeRawOutput });
  return { mockValidateInput, sanitizeUrl: vi.mocked(security.sanitizeUrl) };
}

describe('handleScanProject', () => {
  let mockValidateInput: any;
  let mockSanitizeUrl: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const ctx = await setupCommon();
    mockValidateInput = ctx.mockValidateInput;
    mockSanitizeUrl = ctx.sanitizeUrl;
    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token';
  });

  it('validates input and routes the scan through the scanner', async () => {
    const args = { projectPath: '/test/project', severityFilter: ['CRITICAL'], autoSetup: false };
    const result = await handleScanProject(args);

    expect(mockValidateInput).toHaveBeenCalledWith(expect.anything(), args, 'sonar_scan_project');
    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: '/test/project',
        options: expect.objectContaining({ severityFilter: ['CRITICAL'], autoSetup: false }),
      }),
      undefined
    );
    expect(result.content[0].type).toBe('text');
  });

  it('passes the correlation ID through to the scanner', async () => {
    await handleScanProject({}, 'test-corr-123');
    expect(mockScan).toHaveBeenCalledWith(expect.anything(), 'test-corr-123');
  });

  it('formats the scan result (from rawOutput) as text', async () => {
    const result = await handleScanProject({});
    expect(result.content[0].text).toContain('SONARQUBE ANALYSIS RESULTS');
  });

  it('sanitizes SONAR_URL from the environment', async () => {
    await handleScanProject({});
    expect(mockSanitizeUrl).toHaveBeenCalledWith('http://localhost:9000');
  });

  it('propagates validation errors', async () => {
    mockValidateInput.mockImplementation(() => {
      throw new Error('Validation failed');
    });
    await expect(handleScanProject({})).rejects.toThrow('Validation failed');
  });

  it('propagates scanner errors', async () => {
    mockScan.mockRejectedValueOnce(new Error('Scan failed'));
    await expect(handleScanProject({})).rejects.toThrow('Scan failed');
  });

  it('handles ScanRecoverableError with a fallback report', async () => {
    const scanning = await import('../../core/scanning/index.js');
    const fallbackModule = await import('../../core/scanning/fallback/index.js');

    const recoverableError = new (scanning.ScanRecoverableError as any)('Scan failed', {
      configIssues: [],
      scannerOutput: 'test output',
    });
    mockScan.mockRejectedValueOnce(recoverableError);

    vi.mocked(fallbackModule.ScanFallbackService).mockImplementation(function () {
      return { formatForOutput: vi.fn(() => 'SCAN FAILED WITH FALLBACK') } as any;
    });

    const result = await handleScanProject({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('SCAN FAILED WITH FALLBACK');
  });
});

describe('ScanHandler (class)', () => {
  const mockProjectManager: any = {};
  const mockSonarAdmin: any = {};

  beforeEach(async () => {
    vi.clearAllMocks();
    await setupCommon();
  });

  it('validates input and routes the scan through the scanner', async () => {
    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    const args = { projectPath: '/test/project', severityFilter: ['CRITICAL'], autoSetup: false };

    const result = await handler.handle(args);

    expect(mockScan).toHaveBeenCalled();
    expect(result.content[0].text).toContain('SONARQUBE ANALYSIS RESULTS');
  });

  it('passes the correlation ID through', async () => {
    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    await handler.handle({}, 'test-corr-scan');
    expect(mockScan).toHaveBeenCalledWith(expect.anything(), 'test-corr-scan');
  });

  it('propagates scanner errors', async () => {
    mockScan.mockRejectedValueOnce(new Error('DI Scan failed'));
    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    await expect(handler.handle({})).rejects.toThrow('DI Scan failed');
  });

  it('handles ScanRecoverableError with a fallback report', async () => {
    const scanning = await import('../../core/scanning/index.js');
    const fallbackModule = await import('../../core/scanning/fallback/index.js');

    const recoverableError = new (scanning.ScanRecoverableError as any)('Scan failed', {
      configIssues: [],
      scannerOutput: 'test output',
    });
    mockScan.mockRejectedValueOnce(recoverableError);

    vi.mocked(fallbackModule.ScanFallbackService).mockImplementation(function () {
      return { formatForOutput: vi.fn(() => 'DI SCAN FAILED WITH FALLBACK') } as any;
    });

    const handler = new ScanHandler(mockProjectManager, mockSonarAdmin);
    const result = await handler.handle({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('DI SCAN FAILED WITH FALLBACK');
  });
});
