# MCP Handler Test Template

Pattern per testare thin MCP handlers (< 50 righe ciascuno).

## Template Standard

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleXXX } from './xxx.handler';

// Mock dependencies
vi.mock('../../core/YYY/index.js');
vi.mock('../../universal/project-manager');
vi.mock('../../shared/validators/mcp-schemas');
vi.mock('../../infrastructure/security/input-sanitization');

describe('handleXXX', () => {
  let mockService: any;
  let mockValidateInput: any;

  beforeEach(async () => {
    const validators = await import('../../shared/validators/mcp-schemas');
    mockValidateInput = vi.mocked(validators.validateInput);
    mockValidateInput.mockReturnValue({ /* validated args */ });

    const service = await import('../../core/YYY/index.js');
    mockService = {
      method: vi.fn().mockResolvedValue({ /* result */ }),
    };
    vi.mocked(service.ServiceClass).mockImplementation(() => mockService);

    process.env.SONAR_URL = 'http://localhost:9000';
    process.env.SONAR_TOKEN = 'test-token';
  });

  it('should validate input and call service', async () => {
    const result = await handleXXX({});

    expect(mockValidateInput).toHaveBeenCalled();
    expect(mockService.method).toHaveBeenCalled();
    expect(result).toHaveProperty('content');
  });

  it('should propagate errors', async () => {
    mockService.method.mockRejectedValue(new Error('Failed'));

    await expect(handleXXX({})).rejects.toThrow('Failed');
  });
});
```

## Test già creati ✅
- scan.handler.test.ts (10/10 - 100%)

## Test da creare (15 handlers)
1. cleanup.handler.test.ts
2. config-manager.handler.test.ts
3. delete-project.handler.test.ts
4. diagnose-permissions.handler.test.ts
5. duplication-summary.handler.test.ts
6. generate-report.handler.test.ts
7. issue-details.handler.test.ts
8. pattern-analysis.handler.test.ts
9. project-discovery.handler.test.ts
10. project-metrics.handler.test.ts
11. project-setup.handler.test.ts
12. quality-gate.handler.test.ts
13. security-hotspot-details.handler.test.ts
14. security-hotspots.handler.test.ts
15. technical-debt.handler.test.ts

Tutti i test seguiranno questo pattern consolidato.
