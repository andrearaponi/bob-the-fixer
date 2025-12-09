# 🤖 Bob the Fixer

**Intelligent AI system for code quality & security analysis with SonarQube.** Achieve **ZERO technical debt** through automated analysis, security scanning, and natural language interaction with your AI assistant.

> 🚀 **Release**: 0.3.7 - Coverage Gap Detection & 21 MCP tools

![Version](https://img.shields.io/badge/version-0.3.7-blue)
![License](https://img.shields.io/badge/license-AGPL--3.0-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![Container](https://img.shields.io/badge/podman-recommended-blue)
![MCP](https://img.shields.io/badge/MCP-Compatible-brightgreen)

---
## 🎯 Overview


### ✨ Key Features

- **Open Source** - Fully open-source and transparent. Licensed under AGPL-3.0, you can inspect, modify, and contribute to the codebase
- **No API Key Needed** - Works directly with supported AI CLI tools using your personal plan. No extra API keys, no complex setup, no additional costs
- **Everything Runs Locally** - Your code stays on your machine when using local LLMs. All analysis and fixes happen on your infrastructure. Complete privacy and security with local AI models
- **MCP Integration** - 21 MCP tools integrated with SonarQube for comprehensive code analysis. Seamlessly integrates with AI assistants that support MCP protocol
- **One Command Install** - Intelligent installer handles everything automatically. Manages all SonarQube dependencies on Linux and macOS, configures all supported AI CLI tools. Ready in 3-5 minutes
- **Complete Code Quality** - Automated analysis with multi-language support. Security scanning, quality metrics, code coverage tracking. Continuous monitoring to achieve and maintain ZERO technical debt

### 📊 Performance

- **95%** Automated Fix Rate
- **10x** Faster Than Manual Review
- **24/7** Continuous Monitoring

---

## 🚀 Quick Start

### Option 1: ONE COMMAND INSTALL (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/andrearaponi/bob-the-fixer/main/install.sh | bash
```

**Intelligent installer handles everything automatically:**
- **Dependency Detection** - Checks Node.js ≥18, Docker/Podman, jq, curl, etc.
- **Auto-Install Missing Tools** - Interactive Y/N prompts for each dependency
- **Port Conflict Resolution** - Detects occupied ports, offers solutions
- **AI CLI Management** - Detects/installs Claude, Gemini, GitHub Copilot CLIs
- **Smart Container Setup** - Cleans conflicts, starts fresh infrastructure
- **Rollback on Error** - Automatic cleanup if something fails

**Ready in 3-5 minutes!** Tested on **macOS 26.1 Thaoes**, **Ubuntu 24.04 LTS** & **Fedora 43**.

**SonarQube Access:**
- 🌐 Web UI: http://localhost:9000
- 👤 Default Login: admin / admin

📖 **Need manual installation or troubleshooting?** See [Manual Installation Guide](docs/MANUAL_INSTALLATION.md)

---

## 🗑️ Uninstall

To completely remove Bob the Fixer from your system:

```bash
./uninstall.sh
```

**What gets removed:**
- SonarQube and PostgreSQL containers
- Container volumes (all data)
- MCP server registrations from AI CLIs
- Configuration files (.env, logs)
- Build output (dist folder)

**What stays:**
- Docker/Podman
- AI CLIs (Claude, Gemini, etc.)
- Node.js and npm
- Source code repository

The uninstaller will ask for confirmation before removing anything.

---

## 🔄 Update

To update Bob the Fixer to the latest version:

```bash
./update.sh
```

The update script automatically detects what type of update is needed:

| Update Type | Description | What Happens |
|-------------|-------------|--------------|
| **core** | Code changes only | `git pull` + `npm install` + `npm build` |
| **infra** | Container changes | Above + restart SonarQube containers |
| **full** | Breaking changes | Shows migration guide |

**Available options:**

```bash
./update.sh --check     # Check for updates without applying
./update.sh --dry-run   # Preview what would be updated
./update.sh --force     # Bypass uncommitted changes check
```

When an update is available, Bob will show a banner with the update command:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  UPDATE AVAILABLE: Bob the Fixer 0.3.7 (Code update only)
  Current version: 0.3.6
  Notes: Bug fixes and improvements
  Run: ./update.sh
  https://github.com/andrearaponi/bob-the-fixer/releases
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🤖 Designed for AI Coding CLI Tools

Bob the Fixer works **exclusively with command-line AI assistants** that support the Model Context Protocol (MCP). The intelligent installer automatically detects and configures:

- **Claude Code** - Anthropic's official AI coding assistant
- **Gemini CLI** - Google's AI command-line tool
- **GitHub Copilot CLI** - GitHub's AI pair programmer
- **OpenAI CLI** - OpenAI's command-line interface

The installer will detect which AI CLI tools you have installed and configure Bob the Fixer for each one automatically. No manual configuration needed.

---

## 💬 Usage

Bob the Fixer exposes MCP tools that can be invoked through any compatible MCP client. Example usage with natural language:

```
"Scan this project with Bob the Fixer for security issues"
"Fix all critical bugs in this codebase"
"Generate a quality report for this project"
"Check if this code passes quality gates"
```

### Complete Workflow Example

| Step | Natural Prompt | What Happens |
|------|---------------|--------------|
| **1. Initial Analysis** | `"Analyze this project with Bob the Fixer"` | Auto-setup, scan, show top issues |
| **2. Get Details** | `"Tell me about that first critical issue"` | Detailed analysis with code context |
| **3. Fix Issue** | `"Fix that unused field issue"` | AI applies appropriate fix |
| **4. Verify** | `"Compile and run Bob the Fixer again"` | Re-scan and show improvements |

### Advanced Use Cases

- **Security Focus**: `"Check for vulnerabilities and security hotspots"`
- **Bulk Fixing**: `"Show me all critical issues and help me fix them"`
- **Quality Tracking**: `"Generate a report showing our progress"`
- **Pre-Commit Check**: `"Make sure there are no quality issues"`
- **Link Existing Project**: `"Connect this directory to my existing SonarQube project 'my-app'"`
- **Coverage Gaps**: `"Find uncovered code in Calculator.java and write tests for it"`

---

## 🛠️ Available MCP Tools

Bob the Fixer exposes 21 MCP tools for comprehensive code analysis:

### Core Analysis
- **`sonar_scan_project`** - Comprehensive project scanning
- **`sonar_get_issue_details`** - Detailed issue analysis with context
- **`sonar_generate_report`** - Quality reports (summary/detailed/json)
- **`sonar_get_quality_gate`** - Check quality standards compliance

### Advanced Analysis
- **`sonar_get_security_hotspots`** - Security vulnerability detection
- **`sonar_get_security_hotspot_details`** - Detailed security analysis
- **`sonar_analyze_patterns`** - Code pattern and smell detection
- **`sonar_get_duplication_summary`** - Duplicate code analysis
- **`sonar_get_duplication_details`** - Detailed duplication analysis
- **`sonar_get_technical_debt`** - Technical debt estimation
- **`sonar_get_project_metrics`** - Project-wide quality metrics
- **`sonar_get_coverage_gaps`** - Identify uncovered code blocks for test generation
- **`sonar_get_uncovered_files`** - Get prioritized list of files needing test coverage

### Management
- **`sonar_auto_setup`** - Automatic project configuration
- **`sonar_link_existing_project`** - Link existing SonarQube project to directory
- **`sonar_config_manager`** - View/update configuration
- **`sonar_generate_config`** - Generate sonar-project.properties file
- **`sonar_cleanup`** - Clean old projects and tokens
- **`sonar_project_discovery`** - Analyze project structure
- **`sonar_diagnose_permissions`** - Troubleshoot authentication
- **`sonar_delete_project`** - Delete projects and tokens

---

## 🏗️ Architecture

Bob the Fixer follows a **Layered Architecture** for maintainability and testability:

```
┌──────────────────────────────────────────────────────────────┐
│  MCP Interface Layer  (Thin routing, <50 lines/handler)      │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Core Business Logic  (Domain services & orchestrators)      │
└──────────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────────┐
│  Infrastructure Layer  (SonarQube API, File I/O, Security)   │
└──────────────────────────────────────────────────────────────┘
```

### Project Structure

```
bob-the-fixer/
├── packages/
│   ├── core/                     # MCP server & business logic
│   │   ├── src/
│   │   │   ├── mcp/              # MCP handlers
│   │   │   │   └── handlers/     # Individual tool handlers
│   │   │   ├── core/             # Business services
│   │   │   │   ├── analysis/     # Analysis services
│   │   │   │   ├── reporting/    # Report generation
│   │   │   │   ├── project/      # Project setup & discovery
│   │   │   │   ├── scanning/     # Scan orchestration
│   │   │   │   └── admin/        # Admin services
│   │   │   ├── infrastructure/   # Infrastructure layer
│   │   │   │   └── security/     # Security utilities
│   │   │   ├── sonar/            # SonarQube client
│   │   │   ├── universal/        # Universal MCP server
│   │   │   │   ├── transport/    # Transport factories
│   │   │   │   └── http/         # HTTP server & sessions
│   │   │   ├── shared/           # Common utilities
│   │   │   │   ├── validators/   # Input validation
│   │   │   │   ├── utils/        # Utilities
│   │   │   │   ├── types/        # TypeScript types
│   │   │   │   ├── errors/       # Error handling
│   │   │   │   └── logger/       # Logging
│   │   │   └── reports/          # Report templates
│   │   ├── html/                 # HTML assets
│   │   │   └── assets/           # Static files
│   │   └── tests/                # Test files
│   │       └── fixtures/         # Test fixtures
│
├── docs/                         # Documentation
│   └── MANUAL_INSTALLATION.md    # Manual installation guide
│
├── infrastructure/               # Infrastructure config
│   └── podman-compose.yml        # SonarQube + PostgreSQL
│
├── config/                       # Configuration files
├── lib/                          # Additional libraries
│
├── .github/                      # GitHub workflows & templates
│   ├── workflows/
│   └── ISSUE_TEMPLATE/
│
├── install.sh                    # One-command installer
├── uninstall.sh                  # Uninstaller script
└── update.sh                     # Intelligent update script
```

### Design Principles

- **Separation of Concerns** - MCP interface, business logic, and infrastructure are decoupled
- **Testability** - Core services can be tested independently
- **Extensibility** - Easy to add new tools or transport modes
- **Maintainability** - Clear boundaries between layers

---

## 🔧 Configuration

Bob the Fixer is configured automatically by the `install.sh` script:

1. Generates SonarQube token automatically
2. Installs MCP server globally in your AI CLI
3. No manual configuration needed

Environment variables configured:
- `SONAR_URL` - SonarQube server (http://localhost:9000)
- `SONAR_TOKEN` - Authentication token (auto-generated)
- `NODE_ENV` - Environment mode (development)
- `LOG_LEVEL` - Logging verbosity (info)
- `TOKEN_ENCRYPTION_KEY` - Secure key (auto-generated)

📖 **Need manual MCP configuration or HTTP transport mode?** See [Manual Installation Guide](docs/MANUAL_INSTALLATION.md)

---

## 🚦 Quality Metrics

Bob the Fixer tracks:

- **Bugs** - Programming errors
- **Vulnerabilities** - Security issues
- **Code Smells** - Maintainability problems
- **Coverage** - Test coverage percentage
- **Duplications** - Duplicated code blocks
- **Technical Debt** - Estimated fix time

### Quality Gates (Default Thresholds)

- No critical/blocker issues
- Coverage ≥ 80%
- Duplication < 3%
- Maintainability Rating A
- Security Rating A

---

## 🔒 Security Considerations

- **Input Validation** - User inputs validated with Zod schemas
- **Token Storage** - SonarQube tokens encrypted with AES-256
- **Command Safety** - Subprocess execution with proper escaping
- **Local-Only** - Default configuration binds to localhost only
- **AGPL License** - Source code transparency requirement

⚠️ **Note**: This is an early release. Review security requirements before production use.

---

## 🤝 Contributing

We welcome contributions!

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing`
5. Open a Pull Request

---

## 📚 Documentation

- **[Manual Installation](docs/MANUAL_INSTALLATION.md)** - Step-by-step manual setup and troubleshooting

---

## 📄 License


This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).

### Why AGPL-3.0?
The AGPL ensures that any modifications to Bob the Fixer, even when used as a network service, must be shared with the community. This promotes transparency and collaboration in the development of code quality tools.

See [LICENSE](LICENSE) file for full legal text.

---

## 🔗 Resources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [SonarQube Documentation](https://docs.sonarqube.org/)
- [GitHub Repository](https://github.com/andrearaponi/bob-the-fixer)
- [GitHub Issues](https://github.com/andrearaponi/bob-the-fixer/issues)

---

**Developed with ❤️ by Andrea Raponi**
