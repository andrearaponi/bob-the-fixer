/**
 * Dependency Injection Tokens
 *
 * This module defines all the tokens used for dependency injection.
 * Tokens are used to identify dependencies in the DI container.
 */

// Scanner tokens
export const TOKENS = {
  // Scanners
  Scanner: Symbol.for('IScanner'),
  Scanners: Symbol.for('IScanner[]'),
  SonarQubeScanner: Symbol.for('SonarQubeScanner'),
  TrivyScanner: Symbol.for('TrivyScanner'),

  // API Clients
  SonarQubeApiClient: Symbol.for('SonarQubeApiClient'),
  TrivyClient: Symbol.for('TrivyClient'),

  // Repositories
  ScanRepository: Symbol.for('IScanRepository'),
  IssueRepository: Symbol.for('IIssueRepository'),

  // Services
  IssueAnalyzer: Symbol.for('IssueAnalyzer'),
  CoverageAnalyzer: Symbol.for('CoverageAnalyzer'),
  QualityAnalyzer: Symbol.for('QualityAnalyzer'),
  SecurityAnalyzer: Symbol.for('SecurityAnalyzer'),
  PatternAnalysisService: Symbol.for('PatternAnalysisService'),
  CleanupService: Symbol.for('CleanupService'),
  DiagnosticsService: Symbol.for('DiagnosticsService'),
  ProjectDeletionService: Symbol.for('ProjectDeletionService'),
  UnifiedSecurityService: Symbol.for('UnifiedSecurityService'),

  // Infrastructure
  ProjectManager: Symbol.for('IProjectManager'),
  SonarAdmin: Symbol.for('ISonarAdmin'),
  SessionManager: Symbol.for('SessionManager'),
  RuleCache: Symbol.for('RuleCache'),

  // Configuration
  Config: Symbol.for('Config'),
  Logger: Symbol.for('Logger'),

  // HTTP Server
  HTTPServer: Symbol.for('MCPHTTPServer'),

  // Handlers
  Handlers: {
    Cleanup: Symbol.for('CleanupHandler'),
    ConfigManager: Symbol.for('ConfigManagerHandler'),
    CoverageGaps: Symbol.for('CoverageGapsHandler'),
    DeleteProject: Symbol.for('DeleteProjectHandler'),
    DiagnosePermissions: Symbol.for('DiagnosePermissionsHandler'),
    DuplicationSummary: Symbol.for('DuplicationSummaryHandler'),
    GenerateConfig: Symbol.for('GenerateConfigHandler'),
    GenerateReport: Symbol.for('GenerateReportHandler'),
    IssueDetails: Symbol.for('IssueDetailsHandler'),
    LinkExistingProject: Symbol.for('LinkExistingProjectHandler'),
    PatternAnalysis: Symbol.for('PatternAnalysisHandler'),
    ProjectDiscovery: Symbol.for('ProjectDiscoveryHandler'),
    ProjectMetrics: Symbol.for('ProjectMetricsHandler'),
    ProjectSetup: Symbol.for('ProjectSetupHandler'),
    QualityGate: Symbol.for('QualityGateHandler'),
    Scan: Symbol.for('ScanHandler'),
    SecurityHotspotDetails: Symbol.for('SecurityHotspotDetailsHandler'),
    SecurityHotspots: Symbol.for('SecurityHotspotsHandler'),
    TechnicalDebt: Symbol.for('TechnicalDebtHandler'),
    UncoveredFiles: Symbol.for('UncoveredFilesHandler'),
  },
} as const;

// Type for top-level token keys (excluding Handlers which is a nested object)
export type TokenKey = Exclude<keyof typeof TOKENS, 'Handlers'>;

// Type for handler token keys
export type HandlerTokenKey = keyof typeof TOKENS.Handlers;

// Helper to get token by name (top-level tokens only)
export function getToken(name: TokenKey): symbol {
  return TOKENS[name];
}

// Helper to get handler token by name
export function getHandlerToken(name: HandlerTokenKey): symbol {
  return TOKENS.Handlers[name];
}
