/**
 * Mock data for SonarQube API responses
 * Used in unit and integration tests
 */

export const mockProject = {
  key: 'test-project',
  name: 'Test Project',
  qualifier: 'TRK',
  visibility: 'public',
};

export const mockIssue = {
  key: 'AX123-issue-key',
  rule: 'typescript:S1234',
  severity: 'MAJOR',
  component: 'test-project:src/main.ts',
  project: 'test-project',
  line: 42,
  hash: 'abc123',
  textRange: {
    startLine: 42,
    endLine: 42,
    startOffset: 10,
    endOffset: 20,
  },
  flows: [],
  status: 'OPEN',
  message: 'Remove this unused variable',
  effort: '5min',
  debt: '5min',
  author: 'test@example.com',
  tags: ['unused', 'dead-code'],
  creationDate: '2024-01-15T10:30:00+0000',
  updateDate: '2024-01-15T10:30:00+0000',
  type: 'CODE_SMELL',
  // Enhanced fields from additionalFields=_all
  transitions: ['resolve', 'wontfix', 'falsepositive'],
  actions: ['set_type', 'set_tags', 'comment', 'set_severity'],
  comments: [
    {
      key: 'comment-1',
      login: 'user1',
      htmlText: '<p>This variable is used in testing</p>',
      markdown: 'This variable is used in testing',
      updatedAt: '2024-01-15T11:00:00+0000',
      createdAt: '2024-01-15T10:30:00+0000',
    },
  ],
  cleanCodeAttribute: 'COMPLETE',
  cleanCodeAttributeCategory: 'INTENTIONAL',
  impacts: [
    {
      softwareQuality: 'MAINTAINABILITY',
      severity: 'LOW',
    },
  ],
};

export const mockIssuesResponse = {
  total: 2,
  p: 1,
  ps: 100,
  paging: {
    pageIndex: 1,
    pageSize: 100,
    total: 2,
  },
  effortTotal: 15,
  issues: [
    mockIssue,
    {
      ...mockIssue,
      key: 'AX456-another-issue',
      severity: 'CRITICAL',
      type: 'BUG',
      message: 'Fix this potential null pointer',
      line: 100,
    },
  ],
  components: [
    {
      key: 'test-project:src/main.ts',
      enabled: true,
      qualifier: 'FIL',
      name: 'main.ts',
      longName: 'src/main.ts',
      path: 'src/main.ts',
    },
  ],
  rules: [
    {
      key: 'typescript:S1234',
      name: 'Unused variables should be removed',
      lang: 'ts',
      status: 'READY',
      langName: 'TypeScript',
    },
  ],
};

export const mockSourceCode = {
  sources: [
    { line: 40, code: 'function example() {' },
    { line: 41, code: '  const used = "value";' },
    { line: 42, code: '  const unused = "test"; // Issue here' },
    { line: 43, code: '  return used;' },
    { line: 44, code: '}' },
  ],
};

export const mockRule = {
  rule: {
    key: 'typescript:S1234',
    repo: 'typescript',
    name: 'Unused variables should be removed',
    createdAt: '2020-01-01T00:00:00+0000',
    htmlDesc: '<p>Unused variables should be removed to improve code clarity.</p>',
    mdDesc: 'Unused variables should be removed to improve code clarity.',
    severity: 'MAJOR',
    status: 'READY',
    lang: 'ts',
    langName: 'TypeScript',
    params: [],
    type: 'CODE_SMELL',
    tags: [],
    sysTags: [],
    remFnType: undefined,
    remFnBaseEffort: undefined,
    defaultRemFnType: undefined,
    defaultRemFnBaseEffort: undefined,
    effortToFixDescription: undefined,
    scope: undefined,
    isExternal: undefined,
    descriptionSections: [
      {
        key: 'default',
        content: 'Unused variables should be removed to improve code clarity.',
      },
    ],
  },
};

export const mockRulesResponse = {
  total: 3,
  p: 1,
  ps: 10,
  rules: [
    {
      key: 'typescript:S1234',
      repo: 'typescript',
      name: 'Unused variables should be removed',
      severity: 'MAJOR',
      status: 'READY',
      type: 'CODE_SMELL',
      lang: 'ts',
      langName: 'TypeScript',
      scope: 'MAIN',
      isExternal: false,
      tags: [],
      sysTags: [],
      cleanCodeAttribute: 'COMPLETE',
      cleanCodeAttributeCategory: 'INTENTIONAL',
      impacts: [
        {
          softwareQuality: 'MAINTAINABILITY',
          severity: 'LOW',
        },
      ],
      descriptionSections: [
        {
          key: 'root_cause',
          content: '<p>Unused variables should be removed.</p>',
        },
      ],
    },
    {
      key: 'typescript:S1135',
      repo: 'typescript',
      name: 'Track uses of "TODO" tags',
      severity: 'MAJOR',
      status: 'READY',
      type: 'CODE_SMELL',
      lang: 'ts',
      langName: 'TypeScript',
      scope: 'MAIN',
      isExternal: false,
      tags: ['cwe'],
      sysTags: [],
      cleanCodeAttribute: 'COMPLETE',
      cleanCodeAttributeCategory: 'INTENTIONAL',
      impacts: [
        {
          softwareQuality: 'MAINTAINABILITY',
          severity: 'INFO',
        },
      ],
    },
    {
      key: 'typescript:S3776',
      repo: 'typescript',
      name: 'Cognitive Complexity',
      severity: 'MAJOR',
      status: 'READY',
      type: 'CODE_SMELL',
      lang: 'ts',
      langName: 'TypeScript',
      scope: 'MAIN',
      isExternal: false,
      tags: ['brain-overload'],
      sysTags: [],
      cleanCodeAttribute: 'MODULAR',
      cleanCodeAttributeCategory: 'ADAPTABLE',
      impacts: [
        {
          softwareQuality: 'MAINTAINABILITY',
          severity: 'MEDIUM',
        },
      ],
    },
  ],
};

export const mockMetrics = {
  component: {
    key: 'test-project',
    name: 'Test Project',
    qualifier: 'TRK',
    measures: [
      { metric: 'bugs', value: '2', bestValue: false },
      { metric: 'vulnerabilities', value: '1', bestValue: false },
      { metric: 'code_smells', value: '15', bestValue: false },
      { metric: 'coverage', value: '85.5', bestValue: false },
      { metric: 'duplicated_lines_density', value: '3.2', bestValue: false },
      { metric: 'sqale_index', value: '120', bestValue: false }, // Technical debt in minutes
      { metric: 'sqale_rating', value: '1.0', bestValue: true }, // A rating
      { metric: 'reliability_rating', value: '2.0', bestValue: false }, // B rating
      { metric: 'security_rating', value: '1.0', bestValue: true }, // A rating
      { metric: 'ncloc', value: '1500', bestValue: false },
    ],
  },
};

export const mockComponentDetails = {
  component: {
    key: 'test-project:src/main.ts',
    name: 'main.ts',
    qualifier: 'FIL',
    path: 'src/main.ts',
    description: 'Main entry point',
    measures: [
      { metric: 'ncloc', value: '145', bestValue: false },
      { metric: 'complexity', value: '8', bestValue: false },
      { metric: 'duplicated_lines_density', value: '12.0', bestValue: false },
      { metric: 'coverage', value: '82.0', bestValue: false },
      { metric: 'violations', value: '3', bestValue: false },
    ],
  },
};

export const mockQualityGate = {
  projectStatus: {
    status: 'OK',
    conditions: [
      {
        status: 'OK',
        metricKey: 'new_coverage',
        comparator: 'LT',
        errorThreshold: '80',
        actualValue: '85.5',
      },
      {
        status: 'OK',
        metricKey: 'new_bugs',
        comparator: 'GT',
        errorThreshold: '0',
        actualValue: '0',
      },
    ],
    periods: [
      {
        index: 1,
        mode: 'previous_version',
        date: '2024-01-01T00:00:00+0000',
        parameter: '1.0.0',
      },
    ],
    ignoredConditions: false,
  },
};

export const mockQualityGateFailed = {
  projectStatus: {
    status: 'ERROR',
    conditions: [
      {
        status: 'ERROR',
        metricKey: 'new_coverage',
        comparator: 'LT',
        errorThreshold: '80',
        actualValue: '65.0',
      },
      {
        status: 'OK',
        metricKey: 'new_bugs',
        comparator: 'GT',
        errorThreshold: '0',
        actualValue: '0',
      },
    ],
    periods: [
      {
        index: 1,
        mode: 'previous_version',
        date: '2024-01-01T00:00:00+0000',
        parameter: '1.0.0',
      },
    ],
    ignoredConditions: false,
  },
};

export const mockSecurityHotspot = {
  key: 'AX789-hotspot',
  component: 'test-project:src/auth.ts',
  project: 'test-project',
  securityCategory: 'weak-cryptography',
  vulnerabilityProbability: 'HIGH',
  status: 'TO_REVIEW',
  line: 25,
  message: 'Make sure this weak hash algorithm is not used in a sensitive context',
  author: 'dev@example.com',
  creationDate: '2024-01-20T10:00:00+0000',
  updateDate: '2024-01-20T10:00:00+0000',
};

export const mockSecurityHotspotsResponse = {
  paging: {
    pageIndex: 1,
    pageSize: 100,
    total: 1,
  },
  hotspots: [mockSecurityHotspot],
  components: [
    {
      key: 'test-project:src/auth.ts',
      qualifier: 'FIL',
      name: 'auth.ts',
      longName: 'src/auth.ts',
      path: 'src/auth.ts',
    },
  ],
};

export const mockDuplicationData = {
  duplications: [
    {
      blocks: [
        {
          from: 10,
          size: 15,
          _ref: '1',
        },
        {
          from: 50,
          size: 15,
          _ref: '2',
        },
      ],
    },
  ],
  files: {
    '1': {
      key: 'test-project:src/utils.ts',
      name: 'utils.ts',
      uuid: 'file-uuid-1',
    },
    '2': {
      key: 'test-project:src/helpers.ts',
      name: 'helpers.ts',
      uuid: 'file-uuid-2',
    },
  },
};

export const mockComponentTree = {
  baseComponent: {
    key: 'test-project',
    name: 'Test Project',
    qualifier: 'TRK',
  },
  components: [
    {
      key: 'test-project:src',
      name: 'src',
      qualifier: 'DIR',
      path: 'src',
      measures: [
        { metric: 'duplicated_lines_density', value: '5.2' },
        { metric: 'duplicated_lines', value: '78' },
        { metric: 'duplicated_blocks', value: '3' },
      ],
    },
    {
      key: 'test-project:src/main.ts',
      name: 'main.ts',
      qualifier: 'FIL',
      path: 'src/main.ts',
      language: 'ts',
      measures: [
        { metric: 'duplicated_lines_density', value: '10.5' },
        { metric: 'duplicated_lines', value: '42' },
        { metric: 'duplicated_blocks', value: '2' },
      ],
    },
  ],
  paging: {
    pageIndex: 1,
    pageSize: 100,
    total: 2,
  },
};

export const mockAnalysisStatus = {
  task: {
    id: 'AX-task-123',
    type: 'REPORT',
    componentId: 'test-project-id',
    componentKey: 'test-project',
    componentName: 'Test Project',
    componentQualifier: 'TRK',
    analysisId: 'AX-analysis-456',
    status: 'SUCCESS',
    submittedAt: '2024-01-15T10:00:00+0000',
    startedAt: '2024-01-15T10:00:10+0000',
    executedAt: '2024-01-15T10:02:30+0000',
    executionTimeMs: 140000,
    hasScannerContext: true,
  },
};

export const mockAnalysisStatusPending = {
  task: {
    ...mockAnalysisStatus.task,
    status: 'PENDING',
    executedAt: undefined,
    executionTimeMs: undefined,
  },
};

export const mockAnalysisStatusInProgress = {
  task: {
    ...mockAnalysisStatus.task,
    status: 'IN_PROGRESS',
    executedAt: undefined,
  },
};

export const mockErrorResponse = {
  errors: [
    {
      msg: 'Project key already exists',
    },
  ],
};

export const mock401Response = {
  errors: [
    {
      msg: 'Authentication required',
    },
  ],
};

export const mock403Response = {
  errors: [
    {
      msg: 'Insufficient privileges',
    },
  ],
};

export const mock404Response = {
  errors: [
    {
      msg: 'Component not found',
    },
  ],
};

export const mockProjectConfig = {
  projectKey: 'test-project-abc123',
  projectName: 'Test Project',
  sonarUrl: 'http://localhost:9000',
  languages: ['typescript', 'javascript'],
  buildTool: 'npm',
  createdAt: '2024-01-15T10:00:00.000Z',
  lastScanned: '2024-01-15T12:00:00.000Z',
};

// Helper to create custom mock responses
export function createMockIssue(overrides: Partial<typeof mockIssue> = {}) {
  return {
    ...mockIssue,
    ...overrides,
  };
}

export function createMockMetrics(overrides: Record<string, string> = {}) {
  const defaultMeasures = mockMetrics.component.measures;
  const customMeasures = Object.entries(overrides).map(([metric, value]) => ({
    metric,
    value,
    bestValue: false,
  }));

  return {
    component: {
      ...mockMetrics.component,
      measures: [...defaultMeasures, ...customMeasures],
    },
  };
}

export function createMockQualityGate(status: 'OK' | 'WARN' | 'ERROR' = 'OK') {
  return {
    projectStatus: {
      ...mockQualityGate.projectStatus,
      status,
    },
  };
}

// Line coverage mock data for /api/sources/lines endpoint
export const mockLineCoverage = {
  sources: [
    { line: 1, code: 'package com.example;' },
    { line: 2, code: '' },
    { line: 3, code: 'public class Calculator {' },
    { line: 4, code: '  public int add(int a, int b) {', lineHits: 5 },
    { line: 5, code: '    return a + b;', lineHits: 5 },
    { line: 6, code: '  }', lineHits: 5 },
    { line: 7, code: '' },
    { line: 8, code: '  public int divide(int a, int b) {', lineHits: 2 },
    { line: 9, code: '    if (b == 0) {', lineHits: 2, conditions: 2, coveredConditions: 1 },
    { line: 10, code: '      throw new IllegalArgumentException("Cannot divide by zero");', lineHits: 0 },
    { line: 11, code: '    }', lineHits: 0 },
    { line: 12, code: '    return a / b;', lineHits: 2 },
    { line: 13, code: '  }', lineHits: 2 },
    { line: 14, code: '' },
    { line: 15, code: '  public int multiply(int a, int b) {', lineHits: 0 },
    { line: 16, code: '    return a * b;', lineHits: 0 },
    { line: 17, code: '  }', lineHits: 0 },
    { line: 18, code: '}' },
  ],
};

// Helper to create custom line coverage mock
export function createMockLineCoverage(
  lines: Array<{
    line: number;
    code: string;
    lineHits?: number;
    conditions?: number;
    coveredConditions?: number;
  }>
) {
  return { sources: lines };
}
