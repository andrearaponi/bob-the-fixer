/**
 * MCP Tool Definitions
 * All SonarQube tools available through the MCP interface
 */

export const toolDefinitions = [
  {
    name: 'sonar_auto_setup',
    description: '[EN] Automatically setup SonarQube project for current directory with language detection and configuration',
    inputSchema: {
      type: 'object' as const,
      properties: {
        force: {
          type: 'boolean' as const,
          description: 'Force recreation of existing project configuration'
        },
        template: {
          type: 'string' as const,
          enum: ['strict', 'balanced', 'permissive'],
          description: 'Quality gate template to apply (default: balanced)'
        }
      }
    }
  },
  {
    name: 'sonar_project_discovery',
    description: '[EN] Analyze current directory to discover project type, languages, framework and recommend configuration',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string' as const,
          description: 'Directory to analyze (defaults to current working directory)'
        },
        deep: {
          type: 'boolean' as const,
          description: 'Perform deep analysis including dependency scanning'
        }
      }
    }
  },
  {
    name: 'sonar_scan_project',
    description: '[EN] Scan project with SonarQube. USAGE PATTERN: For FIRST scan of a new project, use autoSetup: true. For ALL SUBSEQUENT scans (especially after making fixes), ALWAYS use projectPath: "/full/path/to/project" AND autoSetup: false.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: {
          type: 'string' as const,
          description: 'IMPORTANT: Always provide the full absolute path to the project directory for reliable scans. Required for subsequent scans.'
        },
        severityFilter: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Filter by severity: BLOCKER, CRITICAL, MAJOR, MINOR, INFO'
        },
        typeFilter: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Filter by type: BUG, VULNERABILITY, CODE_SMELL'
        },
        autoSetup: {
          type: 'boolean' as const,
          description: 'CRITICAL: Use true ONLY for first scan. Use false for all subsequent scans. Never omit this parameter.'
        }
      }
    }
  },
  {
    name: 'sonar_get_issue_details',
    description: '[EN] Get detailed information about a specific SonarQube issue with rich context for intelligent fixing. Provides issue details, source code context, complete rule information from SonarQube, and file path for Claude to analyze and fix using Edit tools.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        issueKey: { type: 'string' as const, description: 'SonarQube issue key' },
        contextLines: { type: 'number' as const, description: 'Number of context lines around the issue (default: 10)' },
        includeRuleDetails: { type: 'boolean' as const, description: 'Include detailed rule information from SonarQube (default: true)' },
        includeCodeExamples: { type: 'boolean' as const, description: 'Include compliant/non-compliant code examples (default: true)' },
        includeFilePath: { type: 'boolean' as const, description: 'Include absolute file path for direct editing (default: true)' }
      },
      required: ['issueKey']
    }
  },
  {
    name: 'sonar_generate_report',
    description: '[EN] Generate a comprehensive quality report from SonarQube analysis',
    inputSchema: {
      type: 'object' as const,
      properties: {
        format: {
          type: 'string' as const,
          enum: ['summary', 'detailed', 'json'],
          description: 'Report format (default: summary)'
        }
      }
    }
  },
  {
    name: 'sonar_get_duplication_summary',
    description: '[EN] Get ranked list of files with code duplication, sortable by density (%), absolute lines, or blocks. Shows priority indicators and refactoring recommendations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pageSize: {
          type: 'number' as const,
          minimum: 1,
          maximum: 500,
          description: 'Number of files to analyze (default: 100)'
        },
        sortBy: {
          type: 'string' as const,
          enum: ['density', 'lines', 'blocks'],
          description: 'Sort files by: "density" (% duplication), "lines" (total duplicate lines - best for finding biggest impact), "blocks" (duplicate blocks count)'
        },
        maxResults: {
          type: 'number' as const,
          minimum: 1,
          maximum: 50,
          description: 'Limit output to top N files with most duplication (default: 10, useful for focusing on worst offenders)'
        }
      }
    }
  },
  {
    name: 'sonar_get_duplication_details',
    description: '[EN] Analyze specific file duplication with exact line ranges, affected files, and targeted refactoring recommendations for each duplicate block.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fileKey: {
          type: 'string' as const,
          description: 'File key from SonarQube (e.g., project:path/to/file.java)'
        },
        includeRecommendations: {
          type: 'boolean' as const,
          description: 'Include specific refactoring recommendations (default: true)'
        }
      },
      required: ['fileKey']
    }
  },
  {
    name: 'sonar_get_technical_debt',
    description: '[EN] Comprehensive technical debt analysis with time estimates, budget planning, ROI calculations, and prioritized action plan for bugs, vulnerabilities, and code smells.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        includeBudgetAnalysis: {
          type: 'boolean' as const,
          description: 'Include time budget analysis and planning recommendations (default: true)'
        }
      }
    }
  },
  {
    name: 'sonar_get_quality_gate',
    description: '[EN] Check quality gate status and get recommendations',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'sonar_config_manager',
    description: '[EN] Manage local Bob the Fixer configuration (view, validate, reset)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string' as const,
          enum: ['view', 'validate', 'reset', 'update'],
          description: 'Action to perform on configuration'
        },
        showToken: {
          type: 'boolean' as const,
          description: 'Show token value when viewing configuration (default: false)'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'sonar_cleanup',
    description: '[EN] Clean up unused SonarQube projects and expired tokens',
    inputSchema: {
      type: 'object' as const,
      properties: {
        olderThanDays: {
          type: 'number' as const,
          description: 'Remove projects/tokens older than specified days (default: 30)'
        },
        dryRun: {
          type: 'boolean' as const,
          description: 'Show what would be cleaned up without actually doing it'
        }
      }
    }
  },
  {
    name: 'sonar_diagnose_permissions',
    description: '[EN] Diagnose token permissions and connectivity issues. Helpful for troubleshooting 403 errors.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        verbose: {
          type: 'boolean' as const,
          description: 'Show detailed diagnostic information (default: true)'
        }
      }
    }
  },
  {
    name: 'sonar_get_security_hotspots',
    description: '[EN] Get all security hotspots for the project that require review',
    inputSchema: {
      type: 'object' as const,
      properties: {
        statuses: {
          type: 'array' as const,
          items: { type: 'string' as const, enum: ['TO_REVIEW', 'REVIEWED'] },
          description: 'Filter by hotspot status (default: TO_REVIEW)'
        },
        resolutions: {
          type: 'array' as const,
          items: { type: 'string' as const, enum: ['FIXED', 'SAFE', 'ACKNOWLEDGED'] },
          description: 'Filter by resolution (optional)'
        },
        severities: {
          type: 'array' as const,
          items: { type: 'string' as const, enum: ['HIGH', 'MEDIUM', 'LOW'] },
          description: 'Filter by vulnerability probability (optional)'
        }
      }
    }
  },
  {
    name: 'sonar_get_security_hotspot_details',
    description: '[EN] Get detailed information about a specific security hotspot with fix recommendations and context',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hotspotKey: { type: 'string' as const, description: 'Security hotspot key from SonarQube' },
        includeRuleDetails: { type: 'boolean' as const, description: 'Include detailed rule information and fix recommendations (default: true)' },
        includeFilePath: { type: 'boolean' as const, description: 'Include absolute file path for direct editing (default: true)' },
        contextLines: { type: 'number' as const, description: 'Number of context lines around the issue (default: 10)' }
      },
      required: ['hotspotKey']
    }
  },
  {
    name: 'sonar_get_project_metrics',
    description: '[EN] Get comprehensive project metrics including duplication percentage, quality ratings',
    inputSchema: {
      type: 'object' as const,
      properties: {
        metrics: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'Specific metrics to retrieve (optional, defaults to all common metrics including duplication)'
        }
      }
    }
  },
  {
    name: 'sonar_analyze_patterns',
    description: '[EN] Intelligently analyze and group SonarQube issues to identify patterns, correlations, and provide actionable insights for automated fixing. Groups issues by selected strategy and provides fixability scoring, time estimates, and impact analysis.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        groupBy: {
          type: 'string' as const,
          enum: ['pattern', 'file', 'severity', 'fixability'],
          description: 'How to organize the analysis: pattern (by rule), file (by file), severity (by severity), or fixability (by difficulty)'
        },
        includeImpact: {
          type: 'boolean' as const,
          description: 'Include estimated time/effort and impact reduction'
        },
        includeCorrelations: {
          type: 'boolean' as const,
          description: 'Identify related issues that could be fixed together'
        }
      }
    }
  },
  {
    name: 'sonar_delete_project',
    description: '[EN] Delete a SonarQube project and revoke associated tokens. WARNING: This operation cannot be undone.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectKey: {
          type: 'string' as const,
          description: 'Project key to delete (must be specified explicitly)'
        },
        confirm: {
          type: 'boolean' as const,
          description: 'Confirmation that you really want to delete the project (required: true)'
        }
      },
      required: ['projectKey', 'confirm']
    }
  },
  {
    name: 'sonar_link_existing_project',
    description: '[EN] Link an existing SonarQube project to the current directory. Creates local bobthefixer.env configuration file.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sonarUrl: {
          type: 'string' as const,
          description: 'SonarQube server URL (e.g., http://localhost:9000)'
        },
        projectKey: {
          type: 'string' as const,
          description: 'Existing SonarQube project key'
        },
        token: {
          type: 'string' as const,
          description: 'SonarQube authentication token with project access permissions'
        },
        projectPath: {
          type: 'string' as const,
          description: 'Path to the project directory (defaults to current working directory)'
        }
      },
      required: ['sonarUrl', 'projectKey', 'token']
    }
  },
  {
    name: 'sonar_get_coverage_gaps',
    description: '[EN] Analyze code coverage gaps for a specific file. Returns uncovered code blocks and partial branch coverage with code snippets, optimized for LLM-assisted test generation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        componentKey: {
          type: 'string' as const,
          description: 'SonarQube component key (e.g., "project:src/main/java/Calculator.java"). Use sonar_get_project_metrics to find file keys.'
        },
        minGapSize: {
          type: 'number' as const,
          minimum: 1,
          maximum: 50,
          description: 'Minimum number of consecutive uncovered lines to report as a gap (default: 1)'
        },
        includePartialBranch: {
          type: 'boolean' as const,
          description: 'Include lines with partial branch coverage (default: true)'
        }
      },
      required: ['componentKey']
    }
  },
  {
    name: 'sonar_generate_config',
    description: '[EN] Generate sonar-project.properties file for SonarQube scanning. Use this after sonar_scan_project fails with configuration errors (sources not found, module errors, etc.) to create a proper configuration based on project structure analysis.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        projectPath: {
          type: 'string' as const,
          description: 'Project directory path (defaults to current working directory)'
        },
        config: {
          type: 'object' as const,
          description: 'SonarQube project configuration',
          properties: {
            projectKey: {
              type: 'string' as const,
              description: 'SonarQube project key (optional - will use from bobthefixer.env if available)'
            },
            projectName: {
              type: 'string' as const,
              description: 'Human-readable project name'
            },
            projectVersion: {
              type: 'string' as const,
              description: 'Project version'
            },
            sources: {
              type: 'string' as const,
              description: 'Comma-separated source directories (e.g., "src,lib")'
            },
            tests: {
              type: 'string' as const,
              description: 'Comma-separated test directories'
            },
            exclusions: {
              type: 'string' as const,
              description: 'Comma-separated exclusion patterns (e.g., "**/node_modules/**,**/dist/**")'
            },
            encoding: {
              type: 'string' as const,
              description: 'Source file encoding (default: UTF-8)'
            },
            modules: {
              type: 'array' as const,
              description: 'Multi-module project configuration',
              items: {
                type: 'object' as const,
                properties: {
                  name: { type: 'string' as const, description: 'Module name' },
                  baseDir: { type: 'string' as const, description: 'Module base directory' },
                  sources: { type: 'string' as const, description: 'Source directories' },
                  tests: { type: 'string' as const, description: 'Test directories' },
                  binaries: { type: 'string' as const, description: 'Java binaries directory' },
                  exclusions: { type: 'string' as const, description: 'Exclusion patterns' },
                  language: { type: 'string' as const, description: 'Primary language' }
                },
                required: ['name', 'baseDir', 'sources']
              }
            },
            javaBinaries: {
              type: 'string' as const,
              description: 'Java compiled classes directory (for Java projects)'
            },
            javaLibraries: {
              type: 'string' as const,
              description: 'Path to Java libraries'
            },
            coverageReportPaths: {
              type: 'string' as const,
              description: 'Path to coverage report files'
            },
            additionalProperties: {
              type: 'object' as const,
              description: 'Additional SonarQube properties as key-value pairs',
              additionalProperties: { type: 'string' as const }
            }
          },
          required: ['sources']
        }
      },
      required: ['config']
    }
  }
];
