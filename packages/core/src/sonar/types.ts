export interface SonarIssue {
  key: string;
  rule: string;
  severity: 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER';
  component: string;
  project: string;
  line?: number;
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  flows: any[];
  status: string;
  message: string;
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT';
  effort?: string;
  debt?: string;
  author?: string;
  tags: string[];
  creationDate: string;
  updateDate: string;
  ruleDescription?: string;
  // Enhanced fields from additionalFields=_all
  transitions?: string[];
  actions?: string[];
  comments?: Array<{
    key: string;
    login: string;
    htmlText: string;
    markdown: string;
    updatedAt: string;
    createdAt: string;
  }>;
  cleanCodeAttribute?: string;
  cleanCodeAttributeCategory?: string;
  impacts?: Array<{
    softwareQuality: string;
    severity: string;
  }>;
}

export interface SonarProject {
  key: string;
  name: string;
  qualifier: string;
  visibility: string;
  lastAnalysisDate?: string;
}

export interface SonarAnalysis {
  key: string;
  date: string;
  events: any[];
  projectVersion?: string;
  buildString?: string;
  manualNewCodePeriodBaseline?: boolean;
  revision?: string;
}

export interface IssueFilter {
  types?: Array<'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT'>;
  severities?: Array<'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER'>;
  languages?: string[];
  rules?: string[];
  since?: string;
  statuses?: string[];
  resolved?: boolean;
  tags?: string[];
  components?: string[];
  /**
   * Include extended fields (transitions, actions, comments, impacts).
   * Default: false (to reduce response size and context window usage)
   */
  includeExtendedFields?: boolean;
}

export interface SonarRuleDetails {
  key: string;
  name: string;
  htmlDesc?: string;
  mdDesc?: string;
  severity: string;
  status?: string;
  type: string;
  tags?: string[];
  sysTags?: string[];
  lang?: string;
  langName?: string;
  remFnType?: string;
  remFnBaseEffort?: string;
  defaultRemFnType?: string;
  defaultRemFnBaseEffort?: string;
  effortToFixDescription?: string;
  scope?: string;
  isExternal?: boolean;
  descriptionSections?: Array<{
    key: string;
    content: string;
  }>;
}

// Security hotspot type aliases
export type HotspotStatus = 'TO_REVIEW' | 'REVIEWED';
export type HotspotResolution = 'FIXED' | 'SAFE' | 'ACKNOWLEDGED';
export type HotspotSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SonarSecurityHotspot {
  key: string;
  component: string;
  project: string;
  securityCategory: string;
  vulnerabilityProbability: HotspotSeverity;
  status: HotspotStatus;
  resolution?: HotspotResolution;
  line?: number;
  message: string;
  author: string;
  creationDate: string;
  updateDate: string;
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  flows: any[];
  ruleKey: string;
  messageFormattings?: any[];
}

export interface SonarHotspotsResponse {
  paging: {
    pageIndex: number;
    pageSize: number;
    total: number;
  };
  hotspots: SonarSecurityHotspot[];
  components: Array<{
    key: string;
    qualifier: string;
    name: string;
    longName: string;
    path?: string;
  }>;
}

export interface SonarProjectMetrics {
  component: {
    key: string;
    name: string;
    qualifier: string;
    measures: Array<{
      metric: string;
      value: string;
      bestValue?: boolean;
      periods?: Array<{
        index: number;
        value: string;
      }>;
    }>;
  };
}

export interface SonarSecurityHotspotDetails {
  key: string;
  component: {
    key: string;
    qualifier: string;
    name: string;
    longName: string;
    path?: string;
  };
  project: {
    key: string;
    qualifier: string;
    name: string;
    longName: string;
  };
  rule: {
    key: string;
    name: string;
    securityCategory: string;
    vulnerabilityProbability: HotspotSeverity;
    riskDescription?: string;
    vulnerabilityDescription?: string;
    fixRecommendations?: string;
  };
  status: HotspotStatus;
  resolution?: HotspotResolution;
  line?: number;
  hash: string;
  message: string;
  creationDate: string;
  updateDate: string;
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  changelog: any[];
  comment: any[];
  users: any[];
  canChangeStatus: boolean;
  flows: any[];
  messageFormattings: any[];
  codeVariants: string[];
}

// Code duplication types
export interface SonarFileComponent {
  key: string;
  name: string;
  qualifier: string;
  path: string;
  language?: string;
  measures?: Array<{
    metric: string;
    value: string;
    bestValue?: boolean;
  }>;
}

export interface SonarFilesWithDuplication {
  paging: {
    pageIndex: number;
    pageSize: number;
    total: number;
  };
  baseComponent: {
    key: string;
    name: string;
    qualifier: string;
  };
  components: SonarFileComponent[];
}

export interface SonarDuplicationBlock {
  from: number;
  size: number;
  _ref: string;
}

export interface SonarDuplicationGroup {
  blocks: SonarDuplicationBlock[];
}

export interface SonarDuplicationFile {
  key: string;
  name: string;
  uuid: string;
  project: string;
  projectUuid: string;
  projectName: string;
}

export interface SonarDuplicationDetails {
  duplications: SonarDuplicationGroup[];
  files: { [ref: string]: SonarDuplicationFile };
}

export interface SonarRuleSearchFilter {
  tags?: string[];
  languages?: string[];
  types?: Array<'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT'>;
  severities?: Array<'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER'>;
  statuses?: string[];
  isTemplate?: boolean;
  searchQuery?: string;
}

export interface SonarRuleCompact {
  key: string;
  repo: string;
  name: string;
  severity: string;
  status: string;
  type: string;
  lang: string;
  langName: string;
  scope?: string;
  isExternal?: boolean;
  tags?: string[];
  sysTags?: string[];
  cleanCodeAttribute?: string;
  cleanCodeAttributeCategory?: string;
  impacts?: Array<{
    softwareQuality: string;
    severity: string;
  }>;
  descriptionSections?: Array<{
    key: string;
    content: string;
  }>;
}

export interface SonarRulesResponse {
  total: number;
  p: number;
  ps: number;
  rules: SonarRuleCompact[];
}

export interface SonarComponentDetails {
  key: string;
  name: string;
  qualifier: string;
  path?: string;
  description?: string;
  measures: Array<{
    metric: string;
    value: string;
    bestValue?: boolean;
    periods?: Array<{
      index: number;
      value: string;
    }>;
  }>;
}

export interface SonarQualityGateStatus {
  status: 'OK' | 'WARN' | 'ERROR';
  conditions: Array<{
    status: 'OK' | 'WARN' | 'ERROR';
    metricKey: string;
    comparator: string;
    errorThreshold?: string;
    warningThreshold?: string;
    actualValue: string;
  }>;
  ignoredConditions: boolean;
  period?: {
    mode: string;
    date: string;
    parameter?: string;
  };
  caycStatus?: string;
}

// Line coverage types for /api/sources/lines endpoint
export interface SonarLineCoverage {
  line: number;
  code: string;
  lineHits?: number;      // 0 = not covered, >0 = covered (number of hits)
  utLineHits?: number;    // Unit test hits (often same as lineHits)
  conditions?: number;    // Number of branch conditions (e.g., if/else)
  coveredConditions?: number; // Number of covered branch conditions
  duplicated?: boolean;
  isNew?: boolean;
  scmAuthor?: string;
  scmDate?: string;
  scmRevision?: string;
}

export interface SonarLineCoverageResponse {
  sources: SonarLineCoverage[];
}

// Coverage gap analysis types for CoverageAnalyzer
export interface CoverageGap {
  startLine: number;
  endLine: number;
  lines: SonarLineCoverage[];
  type: 'uncovered' | 'partial_branch';  // uncovered = lineHits === 0, partial = conditions not fully covered
  codeSnippet?: string;  // Optional: the actual code for these lines
}

export interface CoverageAnalysisResult {
  componentKey: string;
  totalLines: number;
  executableLines: number;  // Lines that can be covered (have lineHits property)
  coveredLines: number;
  uncoveredLines: number;
  coveragePercentage: number;
  gaps: CoverageGap[];
  summary: string;  // Human-readable summary for LLM
}

// File-level coverage types for sonar_get_uncovered_files tool
export type CoveragePriority = 'critical' | 'high' | 'medium' | 'low';

export interface FileWithCoverage {
  key: string;              // SonarQube component key
  path: string;             // Relative file path
  name: string;             // File name
  language: string;         // Detected language
  coverage: number;         // Coverage percentage (0-100)
  uncoveredLines: number;   // Number of uncovered lines
  linesToCover: number;     // Total coverable lines
  hasCoverageData: boolean; // True if coverage data exists for this file
  priority: CoveragePriority; // Priority based on coverage level
}

export interface FilesWithCoverageGaps {
  totalFiles: number;                    // Total source files in project
  filesAnalyzed: number;                 // Files with coverage data analyzed
  filesWithGaps: number;                 // Files below target coverage
  filesWithoutCoverageData: number;      // Files missing coverage data
  averageCoverage: number;               // Average coverage across analyzed files
  files: FileWithCoverage[];             // Files with coverage gaps
  filesNeedingCoverageSetup: string[];   // File paths without any coverage data
  hasCoverageReport: boolean;            // True if project has any coverage data uploaded
}
