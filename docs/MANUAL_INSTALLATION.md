# Bob the Fixer - Manual Installation Guide

This guide provides step-by-step instructions for manually installing Bob the Fixer when the automatic installer fails or when you prefer to have full control over the installation process.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Requirements](#system-requirements)
3. [Step-by-Step Installation](#step-by-step-installation)
4. [AI CLI Installation](#ai-cli-installation)
5. [MCP Server Configuration](#mcp-server-configuration)
6. [Verification](#verification)
7. [Manual Uninstallation](#manual-uninstallation)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting the installation, ensure you have the following tools installed on your system:

### Essential Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| **Node.js** | >= 18.0.0 | Runtime for MCP server |
| **npm** | >= 8.0.0 | Package manager |
| **git** | Latest | Version control |
| **Docker** or **Podman** | Latest | Container runtime for SonarQube |
| **docker compose** or **podman-compose** | Latest | Container orchestration |
| **jq** | Latest | JSON processing for token generation |
| **curl** | Latest | HTTP requests |
| **openssl** | Latest | Encryption key generation |
| **Java** | >= 17 | Required for sonar-scanner execution |
| **sonar-scanner** | Latest | Code analysis tool |

---

## System Requirements

### Ports

The following ports must be available on your system:

- **Port 9000**: SonarQube Web UI
- **Port 5432**: PostgreSQL (internal to containers only, no host conflict)

### Disk Space

- Minimum: 2 GB free space
- Recommended: 5 GB free space

---

## Step-by-Step Installation

### Step 1: Install System Dependencies

#### macOS

```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install essential dependencies
brew install node@20 git jq curl openssl

# Install container runtime (choose one)
# Option 1: Podman (recommended - rootless, more secure)
brew install podman
podman machine init
podman machine start

# Option 2: Docker Desktop
# Download and install from: https://docs.docker.com/desktop/install/mac-install/

# Install podman-compose (if using Podman)
brew install podman-compose

# Install Java and sonar-scanner (required)
brew install openjdk@17
sudo ln -sfn $(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk \
  /Library/Java/JavaVirtualMachines/openjdk-17.jdk
brew install sonar-scanner
```

#### Linux (Ubuntu/Debian)

```bash
# Update package list
sudo apt-get update

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install essential dependencies
sudo apt-get install -y git jq curl openssl

# Install container runtime (choose one)
# Option 1: Podman (recommended)
sudo apt-get install -y podman podman-compose

# Option 2: Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
rm get-docker.sh
# Note: You may need to logout and login again

# Install Java and sonar-scanner (required)
sudo apt-get install -y openjdk-17-jdk unzip

# Download and install sonar-scanner
SCANNER_VERSION="5.0.1.3006"
curl -o /tmp/sonar-scanner.zip -L \
  "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SCANNER_VERSION}-linux.zip"
sudo unzip -q /tmp/sonar-scanner.zip -d /opt/
sudo ln -sf /opt/sonar-scanner-${SCANNER_VERSION}-linux/bin/sonar-scanner /usr/local/bin/sonar-scanner
rm /tmp/sonar-scanner.zip
```

#### Linux (Fedora/RHEL)

```bash
# Install Node.js 20.x
sudo dnf module reset nodejs -y
sudo dnf module enable nodejs:20 -y
sudo dnf install -y nodejs npm

# Install essential dependencies
sudo dnf install -y git jq curl openssl

# Install container runtime (choose one)
# Option 1: Podman (recommended)
sudo dnf install -y podman podman-compose

# Option 2: Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
rm get-docker.sh
# Note: You may need to logout and login again

# Install Java and sonar-scanner (required)
sudo dnf install -y java-17-openjdk java-17-openjdk-devel unzip

# Download and install sonar-scanner
SCANNER_VERSION="5.0.1.3006"
curl -o /tmp/sonar-scanner.zip -L \
  "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SCANNER_VERSION}-linux.zip"
sudo unzip -q /tmp/sonar-scanner.zip -d /opt/
sudo ln -sf /opt/sonar-scanner-${SCANNER_VERSION}-linux/bin/sonar-scanner /usr/local/bin/sonar-scanner
rm /tmp/sonar-scanner.zip
```

### Step 2: Verify Dependencies

Check that all essential tools are installed:

```bash
# Check Node.js (should be >= 18.0.0)
node -v

# Check npm (should be >= 8.0.0)
npm -v

# Check git
git --version

# Check container runtime
podman --version  # or: docker --version

# Check compose tool
podman-compose --version  # or: docker compose version

# Check other tools
jq --version
curl --version
openssl version

# Check Java (should be >= 17)
java -version

# Check sonar-scanner
sonar-scanner --version
```

### Step 3: Check Port Availability

```bash
# Check if port 9000 is free
# On macOS:
lsof -i :9000

# On Linux:
netstat -tuln | grep :9000
# or
ss -tuln | grep :9000

# If port 9000 is in use, you have these options:
# 1. Stop the process using the port
# 2. Use an alternative port (e.g., 9001)
```

If port 9000 is in use, note the alternative port you plan to use.

### Step 4: Clone Repository

```bash
# Clone the repository
git clone https://github.com/andrearaponi/bob-the-fixer.git
cd bob-the-fixer

# Make installation scripts executable
chmod +x install.sh uninstall.sh lib/*.sh
```

### Step 5: Setup Infrastructure (Docker/Podman)

#### Start Podman Machine (macOS only)

```bash
# Check if Podman machine is running
podman version

# If not running, start it
podman machine start

# Wait for it to be ready (may take 30-60 seconds)
```

#### Pull Container Images

```bash
# Detect container runtime
if command -v podman &> /dev/null; then
  CONTAINER_CMD="podman"
  COMPOSE_CMD="podman-compose"
elif command -v docker &> /dev/null; then
  CONTAINER_CMD="docker"
  COMPOSE_CMD="docker compose"
fi

# Pull PostgreSQL image
$CONTAINER_CMD pull docker.io/library/postgres:15-alpine

# Pull SonarQube image
$CONTAINER_CMD pull docker.io/library/sonarqube@sha256:7106d77329a6fdac1a0daa8fc797da4f790f88f7cb796cc6b09375e7c889203b
```

#### Start Containers

```bash
# Navigate to infrastructure directory
cd infrastructure

# Start containers with compose
$COMPOSE_CMD -f podman-compose.yml up -d

# Check containers are running
$CONTAINER_CMD ps

# Expected output should show:
# - bobthefixer_postgres
# - bobthefixer_sonarqube
```

#### Wait for SonarQube to be Ready

```bash
# SonarQube takes 2-3 minutes to start
# Monitor startup progress
$CONTAINER_CMD logs -f bobthefixer_sonarqube

# Wait until you see:
# "SonarQube is operational"
# Then press Ctrl+C to stop following logs

# Alternatively, check the health endpoint
curl -s http://localhost:9000/api/system/health

# Should return: {"health":"GREEN","status":"UP"}
```

### Step 6: Generate SonarQube Access Token

Generating the SonarQube access token is a critical step. The process requires waiting for both the API and authentication system to be fully initialized.

#### Step 6.1: Verify SonarQube API is Ready

```bash
# Check if SonarQube API is responding
curl -s http://localhost:9000/api/system/health

# Expected output: {"health":"GREEN","status":"UP"}
```

#### Step 6.2: Wait for Authentication System

The authentication system takes additional time to initialize after the API is ready:

```bash
# Test authentication endpoint
curl -s -u admin:admin "http://localhost:9000/api/authentication/validate"

# If you get a response, authentication is ready
# If you get connection refused or timeout, wait longer
```

#### Step 6.3: Generate Token with Retry Logic

SonarQube may need several attempts before it's ready to generate tokens. Here's the recommended approach:

```bash
# Attempt token generation with retry logic
for attempt in {1..20}; do
  echo "Attempt $attempt: Generating token..."

  # Create temporary file for response
  TEMP_RESPONSE=$(mktemp)

  # Make request and capture HTTP status code
  HTTP_CODE=$(curl -s -w "%{http_code}" -u admin:admin -X POST \
    "http://localhost:9000/api/user_tokens/generate" \
    -d "name=bobthefixer-$(date +%s)" \
    -o "$TEMP_RESPONSE")

  # Extract token from response
  SONAR_TOKEN=$(cat "$TEMP_RESPONSE" | jq -r '.token' 2>/dev/null)

  # Clean up
  rm -f "$TEMP_RESPONSE"

  # Check if token was generated successfully
  if [ -n "$SONAR_TOKEN" ] && [ "$SONAR_TOKEN" != "null" ] && [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Token generated successfully!"
    echo "Token: $SONAR_TOKEN"
    break
  fi

  # Check for authentication errors (401)
  if [ "$HTTP_CODE" = "401" ]; then
    echo "⚠ Authentication failed (HTTP 401)"

    # After several attempts, it might require password change
    if [ $attempt -gt 5 ]; then
      echo ""
      echo "SonarQube may require password change on first login."
      echo "Please follow the manual token generation process below."
      break
    fi
  fi

  # Wait before retry (progressive delay)
  if [ $attempt -le 3 ]; then
    sleep 10
  elif [ $attempt -le 10 ]; then
    sleep 5
  else
    sleep 3
  fi
done

# Verify token was set
if [ -z "$SONAR_TOKEN" ] || [ "$SONAR_TOKEN" = "null" ]; then
  echo "❌ Token generation failed after $attempt attempts"
  echo "Please use manual token generation (see below)"
fi
```

#### Step 6.4: Manual Token Generation (If Automatic Fails)

If the automatic token generation fails, you'll need to generate it manually:

**Option A: Using SonarQube Web UI**

1. Open http://localhost:9000 in your browser
2. Login with default credentials:
   - Username: `admin`
   - Password: `admin`
3. If prompted, change the default password and remember it
4. Navigate to: **My Account** (top right) → **Security** tab
5. Under **Generate Tokens**:
   - Enter name: `bobthefixer`
   - Select type: **User Token**
   - Click **Generate**
6. Copy the generated token immediately (it won't be shown again)
7. Save it to the `SONAR_TOKEN` variable:

```bash
# Paste your token here
SONAR_TOKEN="your-generated-token-here"

# Verify it's set
echo "Token: $SONAR_TOKEN"
```

**Option B: Using curl with New Password**

If you changed the password via the web UI:

```bash
# Replace 'new-password' with your actual password
NEW_PASSWORD="your-new-password"

# Generate token with new credentials
SONAR_TOKEN=$(curl -s -u admin:$NEW_PASSWORD -X POST \
  "http://localhost:9000/api/user_tokens/generate" \
  -d "name=bobthefixer-$(date +%s)" | jq -r '.token')

# Verify
echo "Token: $SONAR_TOKEN"
```

#### Step 6.5: Validate Token

Once you have the token, validate it works:

```bash
# Test token validity
VALIDATION=$(curl -s -H "Authorization: Bearer $SONAR_TOKEN" \
  "http://localhost:9000/api/authentication/validate")

# Check if valid
echo "$VALIDATION" | jq '.'

# Should show: "valid": true
```

**Troubleshooting Token Generation:**

- **"null" response**: SonarQube not fully initialized. Wait 30-60 seconds and retry.
- **HTTP 401**: Authentication required. Password may need to be changed via web UI.
- **HTTP 500**: SonarQube internal error. Check logs: `$CONTAINER_CMD logs bobthefixer_sonarqube`
- **Connection refused**: SonarQube not started. Verify containers are running.
- **Timeout**: SonarQube overloaded. Increase Docker/Podman memory to 4GB.

### Step 7: Create Environment Configuration

```bash
# Navigate back to project root
cd ..

# Generate encryption key
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Create .env file
cat > .env << EOF
SONAR_URL=http://localhost:9000
SONAR_TOKEN=$SONAR_TOKEN
SONAR_PROJECT_KEY_PREFIX=bobthefixer
NODE_ENV=development
LOG_LEVEL=info
RATE_LIMIT_ENABLED=true
ENCRYPTION_KEY=$ENCRYPTION_KEY
LOG_FORMAT=text
LOG_FILE_PATH=./logs/mcp-server.log
HEALTH_CHECK_INTERVAL=30000
EOF

# Create logs directory
mkdir -p logs

# Verify .env file was created
cat .env
```

### Step 8: Build the Project

```bash
# Install npm dependencies
npm install

# Build TypeScript project
npm run build

# Verify build output
ls -la packages/core/dist/universal-mcp-server.js

# Should show the compiled MCP server file
```

---

## AI CLI Installation

Bob the Fixer requires at least one AI CLI to function. Choose one or more from the options below:

### Option 1: Claude CLI (Recommended)

```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-code

# Verify installation
claude --version

# Authenticate
claude auth login
```

### Option 2: Gemini CLI

```bash
# Install Gemini CLI
npm install -g @google/gemini-cli

# Verify installation
gemini --version

# Authenticate
gemini auth login
```

### Option 3: GitHub Copilot CLI

```bash
# Install GitHub Copilot CLI
npm install -g @github/copilot

# Verify installation
npm list -g @github/copilot

# Create config directory
mkdir -p ~/.copilot
```

### Option 4: OpenAI Codex CLI

```bash
# Install OpenAI Codex CLI
npm install -g @openai/codex

# Verify installation
codex --version

# Authenticate
codex auth login
```

**Linux Note**: On Linux, you may need to use `sudo` for global npm installations:

```bash
sudo npm install -g @anthropic-ai/claude-code
# or
sudo npm install -g @google/gemini-cli
# or
sudo npm install -g @github/copilot
# or
sudo npm install -g @openai/codex
```

---

## MCP Server Configuration

After building the project and installing at least one AI CLI, configure the MCP server:

### For Claude CLI

```bash
# Get the full path to the MCP server
MCP_SERVER_PATH="$(pwd)/packages/core/dist/universal-mcp-server.js"

# Remove existing installation (if any)
claude mcp remove bob-the-fixer 2>/dev/null || true

# Install Bob the Fixer MCP server
claude mcp add bob-the-fixer node "$MCP_SERVER_PATH" \
  --scope user \
  --env SONAR_URL=http://localhost:9000 \
  --env SONAR_TOKEN="$SONAR_TOKEN" \
  --env NODE_ENV=development \
  --env LOG_LEVEL=debug \
  --env LOG_FORMAT=text \
  --env RATE_LIMIT_ENABLED=true \
  --env HEALTH_CHECK_INTERVAL=30000 \
  --env LOG_FILE_PATH=/tmp/bobthefixer-mcp.log \
  --env TOKEN_ENCRYPTION_KEY="$ENCRYPTION_KEY"

# Verify installation
claude mcp list | grep bob-the-fixer
```

### For Gemini CLI

```bash
# Get the full path to the MCP server
MCP_SERVER_PATH="$(pwd)/packages/core/dist/universal-mcp-server.js"

# Remove existing installation (if any)
gemini mcp remove bob-the-fixer 2>/dev/null || true

# Install Bob the Fixer MCP server
gemini mcp add bob-the-fixer node "$MCP_SERVER_PATH" \
  --scope user \
  --env SONAR_URL=http://localhost:9000 \
  --env SONAR_TOKEN="$SONAR_TOKEN" \
  --env NODE_ENV=development \
  --env LOG_LEVEL=debug \
  --env LOG_FORMAT=text \
  --env RATE_LIMIT_ENABLED=true \
  --env HEALTH_CHECK_INTERVAL=30000 \
  --env LOG_FILE_PATH=/tmp/bobthefixer-mcp.log \
  --env TOKEN_ENCRYPTION_KEY="$ENCRYPTION_KEY"

# Verify installation
gemini mcp list | grep bob-the-fixer
```

### For OpenAI Codex CLI

```bash
# Get the full path to the MCP server
MCP_SERVER_PATH="$(pwd)/packages/core/dist/universal-mcp-server.js"

# Remove existing installation (if any)
codex mcp remove bob-the-fixer 2>/dev/null || true

# Install Bob the Fixer MCP server with extended timeouts
codex mcp add bob-the-fixer \
  --env SONAR_URL=http://localhost:9000 \
  --env SONAR_TOKEN="$SONAR_TOKEN" \
  --env NODE_ENV=development \
  --env LOG_LEVEL=debug \
  --env LOG_FORMAT=json \
  --env RATE_LIMIT_ENABLED=true \
  --env HEALTH_CHECK_INTERVAL=30000 \
  --env LOG_FILE_PATH=/tmp/bobthefixer-mcp.log \
  --env TOKEN_ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  -- node "$MCP_SERVER_PATH"

# Add timeout parameters to Codex config (required for long-running scans)
CODEX_CONFIG="$HOME/.codex/config.toml"

# Edit the config file to add timeouts after the args line
if [ -f "$CODEX_CONFIG" ]; then
  # Add these lines manually to the [mcp_servers.bob-the-fixer] section:
  # startup_timeout_ms = 30_000
  # tool_timeout_sec = 600
  # exec_timeout_ms = 600_000

  cat >> "$CODEX_CONFIG" <<EOF

# Extended timeouts for Bob the Fixer
startup_timeout_ms = 30_000
tool_timeout_sec = 600
exec_timeout_ms = 600_000
EOF
fi

# Verify installation
codex mcp list | grep bob-the-fixer
```

### For GitHub Copilot

GitHub Copilot uses a JSON configuration file instead of CLI commands:

```bash
# Create or update mcp-config.json
COPILOT_CONFIG="$HOME/.copilot/mcp-config.json"
MCP_SERVER_PATH="$(pwd)/packages/core/dist/universal-mcp-server.js"

# Create config file
cat > "$COPILOT_CONFIG" <<EOF
{
  "mcpServers": {
    "bob-the-fixer": {
      "type": "local",
      "command": "node",
      "tools": ["*"],
      "args": ["$MCP_SERVER_PATH"],
      "env": {
        "SONAR_URL": "http://localhost:9000",
        "SONAR_TOKEN": "$SONAR_TOKEN",
        "LOG_LEVEL": "info",
        "ENCRYPTION_KEY": "$ENCRYPTION_KEY",
        "LOG_FILE_PATH": "./logs/mcp-server.log"
      }
    }
  }
}
EOF

# Verify configuration
cat "$COPILOT_CONFIG"
```

If the config file already exists and you want to merge configurations:

```bash
# Use jq to merge the configuration
TEMP_CONFIG=$(mktemp)

jq --arg path "$MCP_SERVER_PATH" \
   --arg url "http://localhost:9000" \
   --arg token "$SONAR_TOKEN" \
   --arg key "$ENCRYPTION_KEY" \
   '.mcpServers["bob-the-fixer"] = {
     "type": "local",
     "command": "node",
     "tools": ["*"],
     "args": [$path],
     "env": {
       "SONAR_URL": $url,
       "SONAR_TOKEN": $token,
       "LOG_LEVEL": "info",
       "ENCRYPTION_KEY": $key,
       "LOG_FILE_PATH": "./logs/mcp-server.log"
     }
   }' "$COPILOT_CONFIG" > "$TEMP_CONFIG"

mv "$TEMP_CONFIG" "$COPILOT_CONFIG"
```

---

## Verification

### 1. Verify Containers are Running

```bash
# Check container status
if command -v podman &> /dev/null; then
  podman ps | grep bobthefixer
elif command -v docker &> /dev/null; then
  docker ps | grep bobthefixer
fi

# Expected output:
# bobthefixer_postgres   - Up
# bobthefixer_sonarqube  - Up
```

### 2. Verify SonarQube API

```bash
# Check SonarQube health
curl -s http://localhost:9000/api/system/health

# Expected output:
# {"health":"GREEN","status":"UP"}
```

### 3. Verify Token

```bash
# Validate token
curl -s -H "Authorization: Bearer $SONAR_TOKEN" \
  "http://localhost:9000/api/authentication/validate"

# Expected output should contain:
# "valid":true
```

### 4. Verify MCP Server Build

```bash
# Check if MCP server file exists
ls -la packages/core/dist/universal-mcp-server.js

# Should show the compiled file
```

### 5. Verify AI CLI Integration

```bash
# For Claude
claude mcp list | grep bob-the-fixer

# For Gemini
gemini mcp list | grep bob-the-fixer

# For OpenAI Codex
codex mcp list | grep bob-the-fixer

# For GitHub Copilot
cat ~/.copilot/mcp-config.json | jq '.mcpServers["bob-the-fixer"]'
```

### 6. Test Bob the Fixer

```bash
# Open Claude (or your preferred AI CLI)
claude

# In the Claude prompt, ask:
# "Can you list the available MCP tools?"

# You should see Bob the Fixer tools listed, including:
# - analyze-project
# - fix-issues
# - get-analysis-results
# etc.
```

---

## Manual Uninstallation

If you need to uninstall Bob the Fixer manually:

### Step 1: Remove Containers

```bash
cd bob-the-fixer/infrastructure

# Detect container runtime
if command -v podman &> /dev/null; then
  CONTAINER_CMD="podman"
  COMPOSE_CMD="podman-compose"
elif command -v docker &> /dev/null; then
  CONTAINER_CMD="docker"
  COMPOSE_CMD="docker compose"
fi

# Stop and remove containers
$COMPOSE_CMD -f podman-compose.yml down --volumes

# Or manually:
$CONTAINER_CMD stop bobthefixer_postgres bobthefixer_sonarqube
$CONTAINER_CMD rm bobthefixer_postgres bobthefixer_sonarqube

# Remove volumes
$CONTAINER_CMD volume rm \
  bobthefixer_postgres_data \
  bobthefixer_sonarqube_data \
  bobthefixer_sonarqube_extensions \
  bobthefixer_sonarqube_logs
```

### Step 2: Remove MCP Server from AI CLIs

```bash
# From Claude
claude mcp remove bob-the-fixer

# From Gemini
gemini mcp remove bob-the-fixer

# From OpenAI Codex
codex mcp remove bob-the-fixer

# From GitHub Copilot (using jq)
COPILOT_CONFIG="$HOME/.copilot/mcp-config.json"
TEMP_CONFIG=$(mktemp)
jq 'del(.mcpServers["bob-the-fixer"])' "$COPILOT_CONFIG" > "$TEMP_CONFIG"
mv "$TEMP_CONFIG" "$COPILOT_CONFIG"
```

### Step 3: Clean Configuration Files

```bash
cd bob-the-fixer

# Remove .env file
rm -f .env

# Remove logs directory
rm -rf logs

# Remove build output
rm -rf packages/core/dist

# Optional: Remove node_modules
rm -rf node_modules
```

### Step 4: Verify Removal

```bash
# Check no containers remain
$CONTAINER_CMD ps -a | grep bobthefixer

# Check MCP server not registered
claude mcp list | grep bob-the-fixer
gemini mcp list | grep bob-the-fixer
codex mcp list | grep bob-the-fixer

# Check configuration files removed
ls -la .env logs packages/core/dist
```

---

## Troubleshooting

### Issue: Port 9000 Already in Use

**Solution 1**: Find and stop the process using the port

```bash
# On macOS
lsof -i :9000

# On Linux
netstat -tuln | grep :9000

# Kill the process (replace PID with actual process ID)
kill -9 <PID>
```

**Solution 2**: Use an alternative port

```bash
# Edit infrastructure/podman-compose.yml
# Change "9000:9000" to "9001:9000" in the sonarqube ports section

# Update SONAR_URL in .env
SONAR_URL=http://localhost:9001
```

### Issue: SonarQube Won't Start

**Check logs**:

```bash
$CONTAINER_CMD logs bobthefixer_sonarqube

# Common issues:
# - Not enough memory (requires at least 2GB RAM)
# - Elasticsearch bootstrap checks failed
```

**Solution**: Increase Docker/Podman resources

- Docker Desktop: Settings → Resources → increase RAM to 4GB
- Podman: `podman machine set --memory 4096`

### Issue: Token Generation Fails

**Symptoms**: Token is `null` or empty

**Solutions**:

1. Wait longer (SonarQube may still be initializing)
2. Check if password change is required:
   - Visit http://localhost:9000
   - Login with admin/admin
   - Change password if prompted
3. Generate token manually in SonarQube UI

### Issue: MCP Server Not Recognized by AI CLI

**Check**:

```bash
# Verify MCP server file exists
ls -la packages/core/dist/universal-mcp-server.js

# Verify AI CLI can see it
claude mcp list
```

**Solution**:

```bash
# Re-register with full absolute path
MCP_SERVER_PATH="$(pwd)/packages/core/dist/universal-mcp-server.js"
claude mcp add bob-the-fixer node "$MCP_SERVER_PATH" [...]
```

### Issue: Build Fails

**Common errors**:

- `npm ERR! EACCES: permission denied`
  - Solution: Fix npm permissions or use `sudo npm install -g` for global packages

- `Module not found`
  - Solution: Delete `node_modules` and re-run `npm install`

- `TypeScript compilation error`
  - Solution: Ensure Node.js version >= 18.0.0

### Issue: Podman Machine Not Running (macOS)

```bash
# Check status
podman machine list

# Start machine
podman machine start

# If machine doesn't exist, initialize it
podman machine init
podman machine start
```

### Issue: Permission Denied (Linux)

**For Docker**:

```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Logout and login again, or run:
newgrp docker
```

**For Podman**:

```bash
# Enable podman socket
systemctl --user enable --now podman.socket
```

---

## Additional Resources

- **SonarQube Documentation**: https://docs.sonarqube.org/
- **MCP Protocol**: https://modelcontextprotocol.io/
- **Claude CLI**: https://docs.anthropic.com/claude/docs/claude-cli
- **Docker Documentation**: https://docs.docker.com/
- **Podman Documentation**: https://podman.io/docs

---

## Support

If you encounter issues not covered in this guide:

1. Check the installation log: `/tmp/bob-install-*.log`
2. Check container logs: `podman logs bobthefixer_sonarqube`
3. Review the automatic installer source: `install.sh` and `lib/*.sh`
4. Open an issue on GitHub: https://github.com/andrearaponi/bob-the-fixer/issues

---

**Last Updated**: 2025-11-16
**Version**: 1.0.0
