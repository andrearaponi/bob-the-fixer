# Claude Bob the Fixer MCP Server Specification

**Version:** 0.1.0-beta
**Last Updated:** 2025-10-10
**Protocol:** Model Context Protocol (MCP)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [MCP Tools API](#mcp-tools-api)
4. [Data Models](#data-models)
5. [Security](#security)
6. [Error Handling](#error-handling)
7. [SonarQube Integration](#sonarqube-integration)
8. [Configuration](#configuration)
9. [Logging & Observability](#logging--observability)
10. [Development Guide](#development-guide)

---

## Overview

Claude Bob the Fixer is a Model Context Protocol (MCP) server that provides intelligent code analysis by integrating SonarQube with Claude AI. It enables automated code quality scanning, issue detection, security hotspot analysis, and AI-powered fix recommendations.

### Key Features

- **Automated Project Setup**: Language detection and SonarQube project configuration
- **Code Analysis**: Trigger and monitor SonarQube scans with real-time feedback
- **Issue Management**: Retrieve detailed issue information with code context
- **Security Analysis**: Security hotspot detection and remediation guidance
- **Quality Metrics**: Code duplication, technical debt, and quality gate status
- **AI Integration**: Structured data for Claude AI to provide intelligent fixes

### Technology Stack

- **Runtime**: Node.js ≥18.0.0
- **Language**: TypeScript 5.x
- **Protocol**: MCP SDK (`@modelcontextprotocol/sdk`)
- **HTTP Client**: Axios
- **Validation**: Zod
- **Infrastructure**: SonarQube 25.9.0.112764 (containerized)

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude AI (Client)                        │
└───────────────────────┬─────────────────────────────────────┘
                        │ MCP Protocol (stdio)
                        │
┌───────────────────────▼─────────────────────────────────────┐
│           UniversalBob the FixerMCPServer                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Tool Handlers (16 tools)                            │   │
│  │  - Auto Setup      - Scan Project                    │   │
│  │  - Issue Details   - Security Hotspots               │   │
│  │  - Technical Debt  - Quality Gates                   │   │
│  └────────┬─────────────────┬──────────────┬────────────┘   │
│           │                 │              │                 │
│  ┌────────▼────────┐ ┌─────▼──────┐ ┌────▼─────────┐       │
│  │ ProjectManager  │ │ SonarAdmin │ │ TokenManager │       │
│  └────────┬────────┘ └─────┬──────┘ └────┬─────────┘       │
│           │                 │              │                 │
│  ┌────────▼─────────────────▼──────────────▼─────────┐      │
│  │         SonarQubeClient (HTTP API)                 │      │
│  └────────────────────────┬────────────────────────────┘     │
│                           │                                  │
│  ┌────────────────────────▼────────────────────────────┐    │
│  │  Security Layer (Validation, Sanitization, Rate     │    │
│  │  Limiting, Encryption)                              │    │
│  └─────────────────────────────────────────────────────┘    │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP/REST API
                        │
┌───────────────────────▼──────────────────────────────────────┐
│              SonarQube Server (Containerized)                │
│              PostgreSQL Database                             │
└──────────────────────────────────────────────────────────────┘
```

### Core Classes

#### UniversalBob the FixerMCPServer
**Location**: `src/universal/universal-mcp-server.ts`

Main MCP server class that:
- Implements MCP protocol using `@modelcontextprotocol/sdk`
- Registers and handles 16 MCP tools
- Manages server lifecycle (startup, shutdown, signal handling)
- Coordinates between components (ProjectManager, SonarAdmin, SonarQubeClient)

#### SonarQubeClient
**Location**: `src/sonar/client.ts`

HTTP client for SonarQube API:
- Executes sonar-scanner analysis with file-based locking
- Retrieves issues, hotspots, metrics, and duplication data
- Provides source code context extraction
- Language-specific parameter building (Java, TypeScript, Python, etc.)
- Enhanced error handling with permission diagnostics

#### ProjectManager
**Location**: `src/universal/project-manager.ts`

Project configuration and detection:
- Analyzes project structure and detects languages/frameworks
- Manages `sonarguard.env` configuration files
- Generates unique project keys
- Auto-updates `.gitignore`

#### SonarAdmin
**Location**: `src/universal/sonar-admin.ts`

Administrative operations:
- Creates SonarQube projects
- Generates and manages authentication tokens
- Applies quality gate templates
- Cleanup of old projects and tokens

#### TokenManager
**Location**: `src/security/token-manager.ts`

Secure token handling:
- AES-256-CBC encryption for token storage
- Token validation (format, entropy, length)
- Token masking for safe logging
- Secure token wiping from memory

---

## MCP Tools API

The server exposes 16 MCP tools via the Model Context Protocol. Each tool follows this pattern:

```typescript
{
  name: string,
  description: string,
  inputSchema: ZodSchema  // JSON Schema derived from Zod
}
```

### Tool Catalog

#### 1. sonar_auto_setup

**Description**: Automatically setup SonarQube project with language detection

**Input Schema**:
```typescript
{
  force?: boolean         // Force recreation of existing config (default: false)
  template?: 'strict' | 'balanced' | 'permissive'  // Quality gate template (default: 'balanced')
}
```

**Output**:
- Project configuration details
- Detected languages and frameworks
- SonarQube project URL
- Quality gate settings

**Workflow**:
1. Analyze project directory (detect languages, build tools, frameworks)
2. Generate unique project key
3. Create/verify SonarQube project
4. Generate authentication token
5. Save configuration to `sonarguard.env`
6. Update `.gitignore`

---

#### 2. sonar_project_discovery

**Description**: Analyze project structure and recommend configuration

**Input Schema**:
```typescript
{
  path?: string          // Directory to analyze (default: cwd)
  deep?: boolean         // Perform deep analysis including dependencies (default: false)
}
```

**Output**:
- Detected languages: JavaScript, TypeScript, Java, Python, Go, Rust, C#
- Framework detection: React, Vue, Angular, Express, Spring Boot, etc.
- Build tool detection: Maven, Gradle, npm, Poetry, Cargo
- Source directory structure
- Configuration recommendations

**Language Detection**:
- **JavaScript**: Checks for `package.json`
- **TypeScript**: Checks for `tsconfig.json`
- **Java**: Checks for `pom.xml` (Maven) or `build.gradle` (Gradle)
- **Python**: Checks for `requirements.txt`, `pyproject.toml`, `setup.py`, `Pipfile`
- **Go**: Checks for `go.mod`
- **Rust**: Checks for `Cargo.toml`
- **C#**: Checks for `*.csproj` files

---

#### 3. sonar_scan_project

**Description**: Execute SonarQube analysis and retrieve issues

**Input Schema**:
```typescript
{
  projectPath?: string                    // Path to scan (default: cwd)
  autoSetup?: boolean                     // Auto-setup before scan
  severityFilter?: ('INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER')[]
  typeFilter?: ('BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT')[]
}
```

**Output**:
- Scan status (SUCCESS, FAILED, IN_PROGRESS)
- Issues grouped by severity and type
- Issue summary statistics
- Analysis duration

**Important Usage Pattern**:
- **First scan**: Use `autoSetup: true`
- **Subsequent scans**: Use `autoSetup: false` and provide `projectPath`

**Process Flow**:
1. Load or create project configuration
2. Acquire file-based lock (prevents concurrent scans)
3. Build language-specific scanner parameters
4. Execute `sonar-scanner` CLI
5. Wait for analysis completion (polling with timeout)
6. Fetch and filter issues
7. Release lock

**Lock Mechanism**:
- Creates `.sonar-analysis.lock` file in project directory
- Prevents multiple concurrent sonar-scanner processes
- Auto-removes stale locks (older than 10 minutes)
- Maximum wait time: 2 minutes

---

#### 4. sonar_get_issue_details

**Description**: Get detailed information about a specific issue with code context

**Input Schema**:
```typescript
{
  issueKey: string                        // Issue key (e.g., "AYz1234...")
  contextLines?: number                   // Lines of context around issue (default: 5)
  includeRuleDetails?: boolean            // Include full rule description (default: true)
  includeCodeExamples?: boolean           // Include compliant/non-compliant examples (default: true)
  includeFilePath?: boolean               // Include absolute file path (default: true)
}
```

**Output**:
- Issue metadata (severity, type, status, message)
- Source code context with line numbers
- Rule details (description, remediation guidance)
- Code examples (compliant vs non-compliant)
- File path for direct editing
- Effort to fix estimation

**Rule Details Include**:
- Rule name and description (HTML and Markdown formats)
- Tags (security, bug-prone, performance, etc.)
- Language and scope
- Remediation function type and effort
- Description sections (what, why, how to fix)

---

#### 5. sonar_generate_report

**Description**: Generate comprehensive quality report

**Input Schema**:
```typescript
{
  format?: 'summary' | 'detailed' | 'json'  // Report format (default: 'summary')
}
```

**Output Formats**:

**Summary**:
- Overall quality gate status
- Issue counts by severity
- Top 10 most critical issues
- Security hotspots requiring review
- Code coverage percentage
- Duplication metrics

**Detailed**:
- All issues grouped by file and severity
- Complete rule descriptions
- Remediation guidance for each issue
- Technical debt breakdown

**JSON**:
- Machine-readable format
- Full issue details
- Metrics data
- Suitable for CI/CD integration

---

#### 6. sonar_get_duplication_summary

**Description**: Get ranked list of files with code duplication

**Input Schema**:
```typescript
{
  pageSize?: number       // Files to analyze (1-500, default: 100)
  sortBy?: 'density' | 'lines' | 'blocks'  // Sort criteria (default: 'density')
  maxResults?: number     // Limit output (1-50, default: 10)
}
```

**Output**:
- Files sorted by duplication metrics
- Duplication density percentage
- Absolute duplicate lines count
- Duplicate blocks count
- Priority indicators (🚨 high, ⚠️ moderate, ✅ low)
- Refactoring recommendations

**Sort Options**:
- **density**: Percentage of duplicated lines (best for finding worst offenders)
- **lines**: Total duplicate lines (best for maximizing impact)
- **blocks**: Number of duplicate code blocks

**Recommendations Engine**:
- High duplication (>500 lines): Immediate refactoring needed
- Moderate duplication (>200 lines): Plan refactoring tasks
- Many blocks (>10): Extract reusable methods/classes
- Many files (>5): Consider design patterns (inheritance, composition)

---

#### 7. sonar_get_duplication_details

**Description**: Analyze specific file duplication with exact line ranges

**Input Schema**:
```typescript
{
  fileKey: string                         // SonarQube file key (e.g., "project:path/to/file.java")
  includeRecommendations?: boolean        // Include refactoring tips (default: true)
}
```

**Output**:
- Duplication groups (sets of duplicated blocks)
- Exact line ranges for each duplicate
- Files containing duplicates
- Targeted refactoring recommendations per block
- Visual indicators of duplication severity

---

#### 8. sonar_get_technical_debt

**Description**: Comprehensive technical debt analysis with ROI calculations

**Input Schema**:
```typescript
{
  includeBudgetAnalysis?: boolean         // Include time/budget planning (default: true)
}
```

**Output**:
- Total debt (in minutes)
- Debt ratio (percentage)
- Maintainability rating (A-E)
- Effort to reach rating A
- Breakdown by category:
  - Bugs: Reliability issues
  - Vulnerabilities: Security issues
  - Code Smells: Maintainability issues
- Time budget recommendations
- ROI calculations for debt reduction
- Prioritized action plan

**Debt Levels**:
- **Excellent** (<1h): No action needed
- **Low** (<8h): Regular refactoring
- **Moderate** (<40h): Schedule dedicated time
- **High** (<200h): Immediate attention required
- **Critical** (>200h): Consider major refactoring/rewrite

---

#### 9. sonar_get_quality_gate

**Description**: Check quality gate status and get recommendations

**Input Schema**: None

**Output**:
- Quality gate status (PASSED, FAILED, WARN)
- Conditions evaluated
- Failed conditions with thresholds
- Recommendations for passing
- Historical trend (if available)

**Quality Gate Conditions**:
- Code coverage percentage
- Duplication density
- Maintainability rating
- Reliability rating
- Security rating
- Security hotspots reviewed percentage

---

#### 10. sonar_config_manager

**Description**: Manage local Bob the Fixer configuration

**Input Schema**:
```typescript
{
  action: 'view' | 'validate' | 'reset' | 'update'
  showToken?: boolean     // Show token value when viewing (default: false)
}
```

**Output**:
- Current configuration values
- Validation results
- Configuration file location
- Environment variable status

**Actions**:
- **view**: Display current configuration (tokens masked)
- **validate**: Check configuration validity
- **reset**: Delete configuration (requires confirmation)
- **update**: Modify configuration values

---

#### 11. sonar_cleanup

**Description**: Clean up unused projects and expired tokens

**Input Schema**:
```typescript
{
  olderThanDays?: number  // Age threshold (1-365, default: 30)
  dryRun?: boolean        // Preview without deleting (default: true)
}
```

**Output**:
- Projects eligible for deletion
- Tokens eligible for revocation
- Confirmation prompts (if not dry run)
- Cleanup summary

**Cleanup Criteria**:
- Projects with no recent analysis
- Bob the Fixer-generated tokens older than threshold
- Orphaned configuration files

---

#### 12. sonar_diagnose_permissions

**Description**: Diagnose token permissions and connectivity issues

**Input Schema**:
```typescript
{
  verbose?: boolean       // Show detailed diagnostics (default: true)
}
```

**Output**:
- Connection status to SonarQube server
- Token validation result
- Permission checks:
  - Browse projects
  - Execute analysis
  - Administer quality gates
  - Create projects
- Missing permissions with fix suggestions
- Network connectivity diagnostics

**Useful For**:
- Troubleshooting 401 (Unauthorized) errors
- Troubleshooting 403 (Forbidden) errors
- Verifying token setup after installation

---

#### 13. sonar_get_security_hotspots

**Description**: Get all security hotspots requiring review

**Input Schema**:
```typescript
{
  statuses?: ('TO_REVIEW' | 'REVIEWED')[]              // Filter by status (default: ['TO_REVIEW'])
  resolutions?: ('FIXED' | 'SAFE' | 'ACKNOWLEDGED')[]  // Filter by resolution
  severities?: ('HIGH' | 'MEDIUM' | 'LOW')[]           // Filter by vulnerability probability
}
```

**Output**:
- Security hotspots grouped by severity
- Hotspot metadata (category, probability, location)
- Status and resolution information
- Priority recommendations

**Security Categories**:
- SQL Injection
- XSS (Cross-Site Scripting)
- Command Injection
- Path Traversal
- Weak Cryptography
- Authentication/Authorization issues

---

#### 14. sonar_get_security_hotspot_details

**Description**: Get detailed information about a specific security hotspot

**Input Schema**:
```typescript
{
  hotspotKey: string                      // Hotspot key
  includeRuleDetails?: boolean            // Include rule info (default: true)
  includeFilePath?: boolean               // Include file path (default: true)
}
```

**Output**:
- Hotspot details (message, line, hash)
- Risk description (what's the risk?)
- Vulnerability description (how to exploit?)
- Fix recommendations (how to remediate?)
- Code context with line numbers
- File path for editing
- Change history

---

#### 15. sonar_get_project_metrics

**Description**: Get comprehensive project metrics

**Input Schema**:
```typescript
{
  metrics?: string[]      // Specific metrics to retrieve (optional)
}
```

**Default Metrics**:
- `lines`: Total lines of code
- `ncloc`: Non-commented lines of code
- `coverage`: Test coverage percentage
- `duplicated_lines_density`: Duplication percentage
- `duplicated_lines`: Duplicate lines count
- `duplicated_blocks`: Duplicate blocks count
- `complexity`: Cyclomatic complexity
- `cognitive_complexity`: Cognitive complexity
- `violations`: Total violations
- `bugs`: Bug count
- `vulnerabilities`: Vulnerability count
- `code_smells`: Code smell count
- `security_hotspots`: Security hotspot count
- `security_rating`: Security rating (A-E)
- `reliability_rating`: Reliability rating (A-E)
- `sqale_rating`: Maintainability rating (A-E)
- `sqale_index`: Technical debt (minutes)
- `alert_status`: Quality gate status

**Output**:
- Metric values with descriptions
- Best value indicators
- Period values (new code metrics)
- Historical trends

**Note**: Some metrics like `maintainability_rating` and `technical_debt` may not be available in SonarQube Community Edition 25.9.0.112764.

---

#### 16. sonar_delete_project

**Description**: Delete a SonarQube project and revoke associated tokens

**Input Schema**:
```typescript
{
  projectKey: string      // Project key to delete
  confirm: boolean        // Must be true to proceed
}
```

**Output**:
- Deletion confirmation
- Revoked tokens list
- Warning about irreversibility

**Safety Features**:
- Requires explicit confirmation
- Warns about data loss
- Cannot be undone
- Validates project existence before deletion

---

## Data Models

### Core Types

#### SonarIssue
```typescript
interface SonarIssue {
  key: string;                    // Unique issue identifier
  rule: string;                   // Rule key (e.g., "typescript:S1234")
  severity: 'INFO' | 'MINOR' | 'MAJOR' | 'CRITICAL' | 'BLOCKER';
  component: string;              // File component key
  project: string;                // Project key
  line?: number;                  // Line number where issue occurs
  textRange?: {
    startLine: number;
    endLine: number;
    startOffset: number;
    endOffset: number;
  };
  flows: any[];                   // Data flow information
  status: string;                 // OPEN, CONFIRMED, REOPENED, RESOLVED, CLOSED
  message: string;                // Issue description
  type: 'BUG' | 'VULNERABILITY' | 'CODE_SMELL' | 'SECURITY_HOTSPOT';
  effort?: string;                // Estimated effort to fix
  debt?: string;                  // Technical debt
  author?: string;                // Issue author
  tags: string[];                 // Issue tags
  creationDate: string;           // ISO 8601 timestamp
  updateDate: string;             // ISO 8601 timestamp
}
```

#### SonarRuleDetails
```typescript
interface SonarRuleDetails {
  key: string;                    // Rule key
  name: string;                   // Rule name
  htmlDesc?: string;              // HTML description
  mdDesc?: string;                // Markdown description
  severity: string;               // Default severity
  status?: string;                // READY, DEPRECATED, REMOVED
  type: string;                   // BUG, VULNERABILITY, CODE_SMELL
  tags?: string[];                // Rule tags
  sysTags?: string[];             // System tags
  lang?: string;                  // Language code
  langName?: string;              // Language name
  remFnType?: string;             // Remediation function type
  remFnBaseEffort?: string;       // Base remediation effort
  descriptionSections?: Array<{
    key: string;                  // Section identifier
    content: string;              // Section content (HTML/Markdown)
  }>;
}
```

#### SonarSecurityHotspot
```typescript
interface SonarSecurityHotspot {
  key: string;
  component: string;
  project: string;
  securityCategory: string;       // e.g., "sql-injection"
  vulnerabilityProbability: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'TO_REVIEW' | 'REVIEWED';
  resolution?: 'FIXED' | 'SAFE' | 'ACKNOWLEDGED';
  line?: number;
  message: string;
  author: string;
  creationDate: string;
  updateDate: string;
  textRange?: { ... };
  flows: any[];
  ruleKey: string;
}
```

#### ProjectContext
```typescript
interface ProjectContext {
  path: string;                   // Project root path
  name: string;                   // Project name
  language: string[];             // Detected languages
  framework?: string;             // Framework (react, spring-boot, etc.)
  buildTool?: string;             // Build tool (maven, npm, cargo, etc.)
  packageManager?: string;        // Package manager
}
```

#### ProjectConfig
```typescript
interface ProjectConfig {
  sonarUrl: string;               // SonarQube server URL
  sonarToken: string;             // Authentication token
  sonarProjectKey: string;        // Unique project identifier
  createdAt: string;              // Configuration creation timestamp
  language?: string;              // Primary language
  framework?: string;             // Framework name
}
```

---

## Security

### Security Architecture

Claude Bob the Fixer implements defense-in-depth security:

1. **Input Validation** (Zod schemas)
2. **Input Sanitization** (Path traversal, command injection prevention)
3. **Token Encryption** (AES-256-CBC)
4. **Rate Limiting** (60 requests/minute)
5. **Secure Logging** (Token masking, log injection prevention)
6. **Error Sanitization** (No sensitive data in error messages)

### Input Validation

All MCP tool inputs are validated using Zod schemas before processing:

```typescript
// Example: Path validation
const SafePathSchema = z.string()
  .min(1, 'Path cannot be empty')
  .max(1000, 'Path too long')
  .refine(path => !path.includes('..'), 'Path traversal not allowed')
  .refine(path => !path.includes('\0'), 'Null bytes not allowed')
  .refine(path => !/[<>"|?*]/.test(path), 'Invalid path characters')
  .transform(path => path.trim());
```

### Path Traversal Prevention

**Location**: `src/security/input-sanitization.ts`

```typescript
function sanitizePath(inputPath: string): string {
  // Remove null bytes
  const cleanPath = inputPath.replace(/\0/g, '');

  // Normalize to resolve .. and . components
  const normalizedPath = path.normalize(cleanPath);

  // Block path traversal
  if (normalizedPath.includes('..')) {
    throw new ValidationError('Path traversal detected');
  }

  // Block absolute paths in production
  if (normalizedPath.startsWith('/') && process.env.NODE_ENV === 'production') {
    throw new ValidationError('Absolute paths not allowed in production');
  }

  return normalizedPath;
}
```

### Command Injection Prevention

```typescript
function sanitizeCommandArgs(args: string[]): string[] {
  return args.map(arg => {
    // Remove control characters
    const cleaned = arg.replace(/[\0\r\n]/g, '');

    // Check for shell metacharacters
    const dangerousPatterns = [
      /[;&|`$(){}]/,  // Shell metacharacters
      /\$\(/,         // Command substitution
      /`/,            // Backtick substitution
      />/,            // Redirection
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(cleaned)) {
        throw new ValidationError('Dangerous characters in command argument');
      }
    }

    return cleaned;
  });
}
```

### Token Security

**Encryption**: AES-256-CBC with random IV
**Storage**: Encrypted tokens in `sonarguard.env` (gitignored)
**Runtime**: Prefer environment variables over file storage
**Logging**: Tokens always masked (e.g., `sqp_****xyz`)

```typescript
class TokenManager {
  private readonly algorithm = 'aes-256-cbc';
  private readonly encryptionKey: Buffer;  // 32 bytes

  encryptToken(token: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  decryptToken(encryptedToken: string): string {
    const [ivHex, encrypted] = encryptedToken.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipher(this.algorithm, this.encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

### Rate Limiting

**Implementation**: In-memory sliding window
**Default Limit**: 60 requests per minute
**Scope**: Per identifier (IP, user, etc.)

```typescript
class RateLimiter {
  private requests = new Map<string, number[]>();

  constructor(
    private maxRequests: number = 60,
    private windowMs: number = 60000  // 1 minute
  ) {}

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const requests = this.requests.get(identifier) || [];
    const validRequests = requests.filter(time => time > windowStart);

    if (validRequests.length >= this.maxRequests) {
      return false;  // Rate limit exceeded
    }

    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    return true;
  }
}
```

### URL Sanitization

Prevents SSRF (Server-Side Request Forgery) attacks:

```typescript
function sanitizeUrl(url: string): string {
  const urlObj = new URL(url);

  // Only allow HTTP(S)
  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new ValidationError('Only HTTP and HTTPS allowed');
  }

  // Block private IPs in production
  if (process.env.NODE_ENV === 'production') {
    const privateIpPatterns = [
      /^10\./,                    // 10.0.0.0/8
      /^192\.168\./,              // 192.168.0.0/16
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^169\.254\./,              // Link-local
    ];

    for (const pattern of privateIpPatterns) {
      if (pattern.test(urlObj.hostname)) {
        throw new ValidationError('Private IPs not allowed in production');
      }
    }
  }

  return urlObj.toString();
}
```

---

## Error Handling

### Error Hierarchy

All errors inherit from `BaseError` with structured context:

```typescript
abstract class BaseError extends Error {
  public readonly timestamp: Date;
  public readonly errorCode: string;
  public readonly correlationId?: string;
  public readonly context?: Record<string, any>;
  public readonly retryable: boolean;

  toJSON() { ... }
  getUserMessage(): string { ... }
}
```

### Error Types

1. **ValidationError** - Invalid input (retryable: false)
2. **AuthenticationError** - Auth failure (retryable: false)
3. **SonarQubeError** - SonarQube API error (retryable: depends on status)
4. **FileSystemError** - File operation failure (retryable: true for read/write)
5. **NetworkError** - Network/connectivity issue (retryable: true for 5xx)
6. **ConfigurationError** - Invalid config (retryable: false)
7. **RateLimitError** - Rate limit exceeded (retryable: true)
8. **ToolExecutionError** - MCP tool failure (retryable: depends on cause)
9. **SecurityError** - Security violation (retryable: false)
10. **TimeoutError** - Operation timeout (retryable: true)

### Error Response Format

```json
{
  "name": "SonarQubeError",
  "message": "Failed to fetch issues from SonarQube",
  "errorCode": "SONARQUBE_ERROR",
  "timestamp": "2025-10-10T12:34:56.789Z",
  "correlationId": "1a2b3c4d-5678-90ef-ghij-klmnopqrstuv",
  "context": {
    "projectKey": "my-project-abc123",
    "httpStatus": 403
  },
  "retryable": false,
  "stack": "..."
}
```

### Retry Mechanism

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
  }
): Promise<T> {
  let currentDelay = options.delayMs;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableError(error) || attempt === options.maxAttempts) {
        throw error;
      }

      await sleep(currentDelay);
      currentDelay = Math.min(
        currentDelay * (options.backoffMultiplier || 2),
        options.maxDelayMs || 30000
      );
    }
  }
}
```

### Common Error Scenarios

#### 401 Unauthorized
**Cause**: Invalid or expired token
**Solution**:
1. Restart MCP server to reload environment variables
2. Regenerate token using `./setup-token.sh`
3. Verify token has not expired in SonarQube

#### 403 Forbidden
**Cause**: Insufficient permissions
**Solution**:
1. Use `sonar_diagnose_permissions` tool
2. Verify token has required permissions:
   - Browse projects
   - Execute analysis
   - Administer quality gates (for admin operations)
3. Ensure token is USER_TOKEN (not PROJECT_ANALYSIS_TOKEN)

#### sonar-scanner not found
**Cause**: SonarQube Scanner CLI not installed
**Solution**:
```bash
# macOS
brew install sonar-scanner

# Linux
apt-get install sonar-scanner-cli

# Windows
choco install sonarscanner-msbuild-net46
```

#### Analysis timeout
**Cause**: Large project or slow compilation
**Solution**:
1. Increase timeout in scanner parameters
2. Exclude test files and large directories
3. Use sonar.exclusions to skip unnecessary files

---

## SonarQube Integration

### API Endpoints Used

#### Authentication
- `GET /api/authentication/validate` - Validate token

#### Projects
- `GET /api/projects/search` - Search projects
- `POST /api/projects/create` - Create project
- `POST /api/projects/delete` - Delete project

#### Analysis
- `POST /api/ce/submit` - Submit analysis (via sonar-scanner)
- `GET /api/ce/activity` - Get analysis status
- `GET /api/ce/task` - Get task details

#### Issues
- `GET /api/issues/search` - Search issues
- `GET /api/rules/show` - Get rule details
- `GET /api/sources/lines` - Get source code context

#### Security Hotspots
- `GET /api/hotspots/search` - Search security hotspots
- `GET /api/hotspots/show` - Get hotspot details

#### Metrics
- `GET /api/measures/component` - Get project metrics
- `GET /api/components/tree` - Get component tree with metrics

#### Duplication
- `GET /api/duplications/show` - Get file duplication details

#### Quality Gates
- `GET /api/qualitygates/project_status` - Get quality gate status

#### Tokens
- `POST /api/user_tokens/generate` - Generate token
- `GET /api/user_tokens/search` - List tokens
- `POST /api/user_tokens/revoke` - Revoke token

### SonarQube Version Compatibility

**Tested Version**: SonarQube Community Edition 25.9.0.112764 (SHA digest pinned)

**API Compatibility**:
- Uses SonarQube Web API v9.9+
- Some metrics not available in Community Edition:
  - `maintainability_rating`
  - `technical_debt`
  - Custom quality gates (limited)

**Known Limitations**:
- Community Edition lacks branch analysis
- Pull request decoration not available
- Portfolio management not available

### Scanner Configuration

The server builds language-specific scanner parameters:

#### Java Projects (Maven)
```properties
-Dsonar.projectKey=<key>
-Dsonar.sources=src/main/java
-Dsonar.tests=src/test/java
-Dsonar.java.binaries=target/classes
-Dsonar.java.test.binaries=target/test-classes
-Dsonar.java.source=11  # Auto-detected
```

#### JavaScript/TypeScript
```properties
-Dsonar.projectKey=<key>
-Dsonar.sources=src,lib,app
-Dsonar.tests=test,tests,__tests__
-Dsonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/coverage/**
```

#### Python
```properties
-Dsonar.projectKey=<key>
-Dsonar.sources=src
-Dsonar.tests=test,tests
-Dsonar.exclusions=**/__pycache__/**,**/venv/**,**/.venv/**
```

---

## Configuration

### Environment Variables

#### Required
- `SONAR_URL` - SonarQube server URL (e.g., `http://localhost:9000`)
- `SONAR_TOKEN` - Authentication token (min 20 chars, alphanumeric + `_-`)

#### Optional
- `NODE_ENV` - Environment (`development`, `production`, `test`)
- `LOG_LEVEL` - Logging level (`error`, `warn`, `info`, `debug`)
- `LOG_FORMAT` - Log format (`json`, `text`)
- `TOKEN_ENCRYPTION_KEY` - 32-byte hex key for token encryption

### Configuration Files

#### sonarguard.env
**Location**: Project root (auto-generated, gitignored)

```properties
# Bob the Fixer Local Configuration
# Auto-generated - do not commit to version control

SONAR_URL=http://localhost:9000
SONAR_TOKEN=sqp_1234567890abcdefghijklmnopqrstuvwxyz
SONAR_PROJECT_KEY=my-project-abc12345
CREATED_AT=2025-10-10T12:34:56.789Z
LANGUAGE=javascript,typescript
FRAMEWORK=react
```

#### .gitignore Entry
```
# Bob the Fixer local configuration
sonarguard.env
```

### Quality Gate Templates

Language-specific quality gate configurations:

**JavaScript**:
- New coverage: ≥70%
- Duplication: ≤3%
- Maintainability rating: A
- Reliability rating: A
- Security rating: A

**TypeScript**:
- New coverage: ≥80%
- Duplication: ≤2%
- (Other conditions same as JavaScript)

**Java**:
- New coverage: ≥85%
- Duplication: ≤2%
- Security hotspots reviewed: 100%
- (Other conditions same as TypeScript)

**Python**:
- New coverage: ≥75%
- Duplication: ≤3%
- (Other conditions same as JavaScript)

---

## Logging & Observability

### Structured Logging

**Logger**: `StructuredLogger`
**Location**: `src/logger/structured-logger.ts`

#### Log Entry Format (JSON)

```json
{
  "timestamp": "2025-10-10T12:34:56.789Z",
  "level": "info",
  "message": "MCP tool completed: sonar_scan_project",
  "correlationId": "1a2b3c4d-5678-90ef",
  "tool": "sonar_scan_project",
  "success": true,
  "performance": {
    "startTime": 1696934096789,
    "duration": 12345
  },
  "context": {
    "projectKey": "my-project-abc123",
    "issuesFound": 42
  }
}
```

#### Correlation IDs

Format: `{timestamp}-{counter}-{random}`
Example: `1a2b3c4d-567-8ef901`

Used for:
- Request tracking across components
- Error debugging
- Performance analysis
- Audit trails

#### Security-Safe Logging

All logs undergo sanitization:
- **Tokens**: Masked (e.g., `sqp_****xyz`)
- **Passwords**: Redacted
- **Control characters**: Stripped to prevent log injection
- **Sensitive keys**: Auto-detected and redacted

```typescript
// Token masking
maskToken("sqp_1234567890abcdefghijklmnop")
// Returns: "sqp_****************mnop"

// Log message sanitization
sanitizeLogMessage("Hello\nWorld\r\n\0")
// Returns: "Hello World"
```

### Performance Tracking

```typescript
const startTime = logger.startOperation('sonar_scan_project', { projectKey }, correlationId);

// ... perform operation ...

logger.endOperation('sonar_scan_project', startTime, success, { issuesFound: 42 }, correlationId);
```

**Output**:
```
[2025-10-10T12:34:56.789Z] INFO: Starting sonar_scan_project (1a2b3c4d-567)
[2025-10-10T12:35:09.123Z] INFO: Completed sonar_scan_project (1a2b3c4d-567)
  Duration: 12334ms
  Context: { projectKey: "my-project-abc123", issuesFound: 42 }
```

### Log Levels

1. **ERROR**: Critical failures, exceptions
2. **WARN**: Warnings, degraded functionality
3. **INFO**: Normal operations, tool invocations
4. **DEBUG**: Detailed debugging information

### Log Destinations

- **Console**: Enabled in development and production
- **File**: Optional, configured via `LOG_FILE_PATH`
- **Format**: JSON (machine-readable) or Text (human-readable)

---

## Development Guide

### Project Structure

```
packages/core/src/
├── universal/
│   ├── universal-mcp-server.ts    # Main MCP server (16 tool handlers)
│   ├── project-manager.ts         # Project detection & config
│   ├── sonar-admin.ts             # Admin operations
│   └── server-lifecycle.ts        # Lifecycle management
├── sonar/
│   ├── client.ts                  # SonarQube HTTP client
│   ├── types.ts                   # TypeScript interfaces
│   └── index.ts                   # Exports
├── security/
│   ├── token-manager.ts           # Token encryption & validation
│   └── input-sanitization.ts     # Input sanitization & rate limiting
├── validators/
│   └── mcp-schemas.ts             # Zod validation schemas
├── logger/
│   ├── structured-logger.ts       # Production logger
│   └── mcp-logger.ts              # MCP-specific logger
├── errors/
│   └── custom-errors.ts           # Error hierarchy
└── universal-mcp-server.ts        # Entry point

packages/core/dist/                 # Compiled output (gitignored)
```

### Build Commands

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (development)
npm run dev

# Start MCP server
npm run start:mcp

# Clean build artifacts
npm run clean
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

### Adding a New MCP Tool

1. **Define Zod Schema** (`src/validators/mcp-schemas.ts`):
```typescript
export const MyNewToolSchema = z.object({
  param1: z.string(),
  param2: z.number().optional().default(42)
});
```

2. **Register Tool** (`src/universal/universal-mcp-server.ts`):
```typescript
{
  name: 'my_new_tool',
  description: 'Description of what the tool does',
  inputSchema: zodToJsonSchema(MyNewToolSchema)
}
```

3. **Implement Handler**:
```typescript
private async handleMyNewTool(args: any, correlationId?: string) {
  this.logger.toolInvoked('my_new_tool', correlationId);
  const startTime = Date.now();

  try {
    // Validate input
    const validatedArgs = validateInput(MyNewToolSchema, args, 'my_new_tool');

    // Your logic here
    const result = await this.performOperation(validatedArgs);

    // Log success
    this.logger.toolCompleted('my_new_tool', true, Date.now() - startTime, correlationId);

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    this.logger.toolCompleted('my_new_tool', false, Date.now() - startTime, correlationId);
    throw wrapError(error, correlationId, 'my_new_tool');
  }
}
```

4. **Add to Request Handler** switch statement:
```typescript
case 'my_new_tool':
  return await this.handleMyNewTool(request.params.arguments, correlationId);
```

### Debugging

#### Enable Debug Logging
```bash
export LOG_LEVEL=debug
npm run start:mcp
```

#### Check MCP Server Status
```bash
# List running MCP servers
claude mcp list

# View server logs
claude mcp logs sonar-guard

# Restart server
claude mcp restart sonar-guard
```

#### Test SonarQube Connectivity
```bash
curl -u admin:admin http://localhost:9000/api/system/status
```

#### Test Token Validity
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:9000/api/authentication/validate
```

### Performance Optimization

1. **Scanner Locking**: Prevents concurrent scans that would corrupt results
2. **Issue Caching**: Cache-busting parameters force fresh data
3. **Parallel Requests**: Tools make independent API calls in parallel where possible
4. **Streaming Responses**: Large reports are streamed to avoid memory issues

### Common Issues

#### 401 Error After Server Restart
**Cause**: Environment variables lost on restart
**Fix**: Run `./setup-token.sh` to reinstall with environment variables

#### Stale Analysis Results
**Cause**: SonarQube caches results
**Fix**: Server uses cache-busting parameters (`_t: Date.now()`)

#### sonar-scanner Hanging
**Cause**: Concurrent scans on same project
**Fix**: File-based locking prevents this automatically

---

## Appendix

### Glossary

- **MCP**: Model Context Protocol - Standard for AI tool integration
- **Issue**: Code quality problem detected by SonarQube
- **Hotspot**: Security-sensitive code requiring manual review
- **Quality Gate**: Set of conditions code must pass
- **Technical Debt**: Estimated time to fix all code quality issues
- **Rule**: SonarQube rule defining a code quality check
- **Component**: File or module in SonarQube
- **Measure**: Metric value for a component
- **Duplication**: Repeated code blocks

### References

- [SonarQube Web API Documentation](https://docs.sonarqube.org/latest/extend/web-api/)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [SonarQube Scanner Documentation](https://docs.sonarqube.org/latest/analysis/scan/sonarscanner/)
- [Zod Validation Library](https://zod.dev/)

### Version History

- **v0.1.0-beta** (2025-10-10): Initial release
  - 16 MCP tools
  - Multi-language support
  - Security hardening
  - Structured logging

### License

See LICENSE file in repository root.

---

**End of Specification**
