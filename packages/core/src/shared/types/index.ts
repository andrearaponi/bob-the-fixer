/**
 * Shared types used across the application
 */

// MCP Response types
export interface MCPResponse {
  content: MCPContent[];
  isError?: boolean;
}

export interface MCPContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

// Common enums
export enum Severity {
  BLOCKER = 'BLOCKER',
  CRITICAL = 'CRITICAL',
  MAJOR = 'MAJOR',
  MINOR = 'MINOR',
  INFO = 'INFO'
}

export enum IssueType {
  BUG = 'BUG',
  VULNERABILITY = 'VULNERABILITY',
  CODE_SMELL = 'CODE_SMELL',
  SECURITY_HOTSPOT = 'SECURITY_HOTSPOT'
}

export enum QualityGateStatus {
  OK = 'OK',
  WARN = 'WARN',
  ERROR = 'ERROR',
  NONE = 'NONE'
}

// Project types
export interface ProjectContext {
  name: string;
  path: string;
  language: string[];
  buildTool?: string;
  frameworks?: string[];
  testFrameworks?: string[];
  packageManager?: string;
  hasTests?: boolean;
}

export interface ProjectConfig {
  sonarProjectKey: string;
  sonarUrl: string;
  sonarToken: string;
  sonarOrganization?: string;
  projectPath: string;
}

// Analysis types
export interface ScanParams {
  projectPath?: string;
  severityFilter?: Severity[];
  typeFilter?: IssueType[];
  autoSetup?: boolean;
}

export interface ScanResult {
  projectKey: string;
  totalIssues: number;
  issuesBySeverity: Record<string, number>;
  issuesByType?: Record<string, number>;
  qualityScore: number;
  topIssues: Issue[];
  projectContext: ProjectContext;
  securityHotspots?: {
    total: number;
    byProbability: Record<string, number>;
    topHotspots: SecurityHotspot[];
  };
  cleanCodeMetrics?: {
    reliability: number;
    maintainability: number;
    security: number;
  };
}

export interface Issue {
  key: string;
  severity: Severity;
  type: IssueType;
  message: string;
  component: string;
  line?: number;
  rule?: string;
  effort?: string;
  status?: string;
  tags?: string[];
}

// Report types
export enum ReportFormat {
  SUMMARY = 'summary',
  DETAILED = 'detailed',
  JSON = 'json'
}

export interface ReportOptions {
  format: ReportFormat;
  includeMetrics?: boolean;
  includeIssues?: boolean;
  includeQualityGate?: boolean;
}

// Metrics types
export interface Metrics {
  coverage?: number;
  duplicatedLinesDensity?: number;
  ncloc?: number;
  complexitiy?: number;
  violations?: number;
  bugs?: number;
  vulnerabilities?: number;
  codeSmells?: number;
  securityHotspots?: number;
  technicalDebt?: string;
}

// Security types
export interface SecurityHotspot {
  key: string;
  component: string;
  line?: number;
  message: string;
  status: 'TO_REVIEW' | 'REVIEWED';
  vulnerabilityProbability: 'HIGH' | 'MEDIUM' | 'LOW';
  securityCategory: string;
}

// Quality Gate types
export interface QualityGate {
  status: QualityGateStatus;
  conditions: QualityGateCondition[];
  ignoredConditions?: boolean;
}

export interface QualityGateCondition {
  metric: string;
  operator: string;
  errorThreshold: string;
  actualValue: string;
  status: 'OK' | 'ERROR';
}

// Pattern Analysis types
export interface PatternGroup {
  rule: string;
  count: number;
  issues: Issue[];
  affectedFiles: string[];
  estimatedEffort?: string;
  fixability?: 'easy' | 'medium' | 'hard';
}

export interface PatternAnalysisResult {
  groupBy: 'pattern' | 'file' | 'severity' | 'fixability';
  groups: PatternGroup[];
  totalIssues: number;
  estimatedTotalEffort?: string;
}

// Duplication types
export interface DuplicationBlock {
  from: number;
  size: number;
  _ref: string;
}

export interface DuplicationGroup {
  blocks: DuplicationBlock[];
}

export interface DuplicationFile {
  key: string;
  name: string;
}

export interface DuplicationDetails {
  duplications: DuplicationGroup[];
  files: Record<string, DuplicationFile>;
}

// Technical Debt types
export interface TechnicalDebtItem {
  type: IssueType;
  count: number;
  effort: string;
  minutesEstimated: number;
}

export interface TechnicalDebt {
  total: string;
  totalMinutes: number;
  byType: TechnicalDebtItem[];
  byFile?: Record<string, string>;
}
