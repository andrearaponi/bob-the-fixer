#!/bin/bash

# Bob the Fixer - Universal ONE COMMAND INSTALLER
# Intelligent installation script with dependency management,
# port conflict resolution, and AI CLI setup
#
# Usage:
#   From repository: ./install.sh
#   From web: curl -fsSL https://raw.githubusercontent.com/andrearaponi/bob-the-fixer/main/install.sh | bash

set -e

# ============================================
# TERMINAL COMPATIBILITY FIX
# ============================================
# Some modern terminals (like Ghostty) may not have terminfo entries
# on all systems. Fall back to a compatible TERM if needed.
if [ -n "$TERM" ] && ! infocmp "$TERM" >/dev/null 2>&1; then
    export TERM=xterm-256color
fi

# ============================================
# BOOTSTRAP MODE DETECTION
# ============================================

# Check if we're running from curl/pipe (no script directory available)
if [ -z "${BASH_SOURCE[0]}" ] || [ "${BASH_SOURCE[0]}" = "bash" ]; then
    # We're being piped from curl - bootstrap mode!

    # Configuration
    REPO_URL="https://github.com/andrearaponi/bob-the-fixer.git"
    REPO_NAME="bob-the-fixer"

    # Colors (minimal, can't load from lib yet)
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    RED='\033[0;31m'
    NC='\033[0m'

    echo "Bob the Fixer - Bootstrap Mode"
    echo "=================================="
    echo ""
    echo "Running from web, need to clone repository first..."
    echo ""

    # Check if git is available
    if ! command -v git &> /dev/null; then
        echo -e "${RED}❌ Git not found!${NC}"
        echo "Please install git first:"
        echo "  - macOS: brew install git"
        echo "  - Linux: apt-get install git or dnf install git"
        exit 1
    fi

    # Check if already in repo or repo exists
    if [ -f "./package.json" ] && grep -q "bob-the-fixer" "./package.json" 2>/dev/null; then
        echo -e "${GREEN}Already in Bob the Fixer repository!${NC}"
        echo "Running installer directly..."
        exec bash ./install.sh
        exit 0
    fi

    if [ -d "./$REPO_NAME" ]; then
        echo -e "${YELLOW}⚠️  Directory '$REPO_NAME' already exists${NC}"
        read -p "Remove and start fresh? (y/N): " CHOICE < /dev/tty

        if [ "$CHOICE" = "y" ] || [ "$CHOICE" = "Y" ]; then
            rm -rf "./$REPO_NAME"
        else
            cd "./$REPO_NAME"
            exec bash ./install.sh
            exit 0
        fi
    fi

    # Clone repository
    echo -e "${BLUE}📦 Cloning Bob the Fixer...${NC}"
    if ! git clone "$REPO_URL"; then
        echo -e "${RED}❌ Failed to clone repository!${NC}"
        exit 1
    fi

    echo -e "${GREEN}Repository cloned!${NC}"
    cd "$REPO_NAME"

    # Make scripts executable and run
    chmod +x ./install.sh ./lib/*.sh
    exec bash ./install.sh
    exit 0
fi

# ============================================
# NORMAL INSTALLATION MODE
# ============================================

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load all library modules
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/prompt-utils.sh"
source "$SCRIPT_DIR/lib/os-detect.sh"
source "$SCRIPT_DIR/lib/dependency-checker.sh"
source "$SCRIPT_DIR/lib/port-checker.sh"
source "$SCRIPT_DIR/lib/ai-cli-installer.sh"
source "$SCRIPT_DIR/lib/copilot-mcp-config.sh"
source "$SCRIPT_DIR/lib/rollback.sh"

# Global variables
LOG_FILE="/tmp/bob-install-$(date +%Y%m%d_%H%M%S).log"
INSTALL_START_TIME=$(date +%s)

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handler
trap 'on_error ${LINENO}' ERR

# ============================================
# MAIN INSTALLATION FLOW
# ============================================

main() {
    # Initialize
    print_banner
    init_rollback
    log "Installation started"

    # Step 1: System detection
    print_header "${EMOJI_SEARCH} STEP 1/8: SYSTEM DETECTION"
    print_system_info
    pause

    # Step 2: Check dependencies
    print_header "${EMOJI_PACKAGE} STEP 2/8: DEPENDENCY CHECK"
    if ! check_all_dependencies; then
        print_error "Missing dependencies - cannot continue"
        exit 1
    fi
    record_action "dependencies" "checked"
    pause

    # Step 3: Check ports
    print_header "${EMOJI_PLUG} STEP 3/8: PORT CHECK"
    check_port_tools
    if ! check_all_ports; then
        print_error "Unresolved port conflicts"
        exit 1
    fi
    record_action "ports" "checked"
    pause

    # Step 4: Check AI CLIs
    print_header "${EMOJI_ROBOT} STEP 4/8: AI CLI CHECK"
    check_and_install_ai_clis
    record_action "ai_clis" "checked"
    pause

    # Step 5: Setup infrastructure
    print_header "${EMOJI_DOCKER} STEP 5/8: INFRASTRUCTURE SETUP"
    setup_infrastructure
    record_action "infrastructure" "setup"
    pause

    # Step 6: Build project
    print_header "${EMOJI_WRENCH} STEP 6/8: PROJECT BUILD"
    build_project
    record_action "build" "completed"
    pause

    # Step 7: Install MCP server
    print_header "${EMOJI_GLOBE} STEP 7/8: MCP SERVER INSTALLATION"
    install_mcp_server
    record_action "mcp" "installed"
    pause

    # Step 8: Verification
    print_header "${EMOJI_TEST} STEP 8/8: FINAL VERIFICATION"
    verify_installation
    pause

    # Success!
    show_success_summary

    # Cleanup
    cleanup_temp_files
    clean_rollback_state

    log "Installation completed successfully"
}

# ============================================
# SETUP INFRASTRUCTURE
# ============================================

setup_infrastructure() {
    log "Setting up infrastructure..."

    # Detect container runtime
    local CONTAINER_CMD=""
    local COMPOSE_CMD=""
    local COMPOSE_FILE="$SCRIPT_DIR/infrastructure/podman-compose.yml"

    if command -v podman &> /dev/null; then
        CONTAINER_CMD="podman"
        COMPOSE_CMD="podman-compose -p bobthefixer -f $COMPOSE_FILE"
        print_success "Using Podman"

        # Check if Podman machine is running on macOS
        if [ "$OS_TYPE" = "macos" ]; then
            # Test if podman connection works
            if ! podman version &>/dev/null; then
                print_warning "Podman machine is not running"
                echo ""

                if ask_yes_no "Start Podman machine?" "y"; then
                    print_step "Starting Podman machine..."
                    if podman machine start 2>/dev/null; then
                        print_success "Podman machine started!"
                        sleep 3  # Give it time to fully initialize
                    else
                        # Machine might already be starting, wait and test again
                        print_step "Waiting for Podman machine to be ready..."
                        for i in 1 2 3 4 5; do
                            sleep 2
                            if podman version &>/dev/null; then
                                print_success "Podman machine is ready!"
                                break
                            fi
                        done

                        if ! podman version &>/dev/null; then
                            print_error "Podman machine failed to start"
                            echo "Try running: podman machine init && podman machine start"
                            return 1
                        fi
                    fi
                else
                    print_error "Podman machine must be running"
                    return 1
                fi
            fi
        fi
    elif command -v docker &> /dev/null; then
        CONTAINER_CMD="docker"
        COMPOSE_CMD="docker compose -p bobthefixer -f $COMPOSE_FILE"
        print_success "Using Docker"
    else
        print_error "No container runtime found!"
        return 1
    fi

    # Check if containers already exist
    if $CONTAINER_CMD ps -a | grep -q bobthefixer; then
        print_warning "Bob the Fixer containers already exist"
        echo ""

        if ask_yes_no "Do you want to remove them and start from scratch?" "n"; then
            print_step "Cleaning existing containers..."
            $COMPOSE_CMD down --volumes 2>/dev/null || true
            $CONTAINER_CMD stop bobthefixer_postgres bobthefixer_sonarqube 2>/dev/null || true
            $CONTAINER_CMD rm bobthefixer_postgres bobthefixer_sonarqube 2>/dev/null || true
            $CONTAINER_CMD volume rm bobthefixer_postgres_data bobthefixer_sonarqube_data \
                bobthefixer_sonarqube_extensions bobthefixer_sonarqube_logs 2>/dev/null || true
            print_success "Cleanup completed"
        else
            print_info "Using existing containers"
            return 0
        fi
    fi

    # Check and pull required images
    print_step "Checking required images..."
    echo ""

    local postgres_image="docker.io/library/postgres:15-alpine"
    local sonarqube_image="docker.io/library/sonarqube@sha256:7106d77329a6fdac1a0daa8fc797da4f790f88f7cb796cc6b09375e7c889203b"
    local needs_pull=false

    # Check PostgreSQL image
    if ! $CONTAINER_CMD images --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -q "postgres:15-alpine"; then
        print_info "PostgreSQL image not found, will download..."
        needs_pull=true
    fi

    # Check SonarQube image (check by digest)
    if ! $CONTAINER_CMD image inspect "$sonarqube_image" &>/dev/null; then
        print_info "SonarQube image not found, will download..."
        needs_pull=true
    fi

    # Pull missing images with progress
    if [ "$needs_pull" = true ]; then
        echo ""
        print_step "Downloading container images (this may take a few minutes)..."
        echo ""

        # Pull PostgreSQL
        if ! $CONTAINER_CMD images --format "{{.Repository}}:{{.Tag}}" 2>/dev/null | grep -q "postgres:15-alpine"; then
            print_info "Downloading PostgreSQL 15..."
            $CONTAINER_CMD pull "$postgres_image"
            if [ $? -eq 0 ]; then
                print_success "PostgreSQL image downloaded!"
            else
                print_error "Failed to download PostgreSQL image"
                return 1
            fi
            echo ""
        fi

        # Pull SonarQube
        if ! $CONTAINER_CMD image inspect "$sonarqube_image" &>/dev/null; then
            print_info "Downloading SonarQube..."
            $CONTAINER_CMD pull "$sonarqube_image"
            if [ $? -eq 0 ]; then
                print_success "SonarQube image downloaded!"
            else
                print_error "Failed to download SonarQube image"
                return 1
            fi
            echo ""
        fi
    else
        print_success "All required images available"
        echo ""
    fi

    # Start containers
    print_step "Starting containers..."
    echo ""

    # Redirect verbose output to log file
    local compose_log="/tmp/bob-compose-$$.log"

    # Start compose in background so we can show progress
    $COMPOSE_CMD up -d > "$compose_log" 2>&1 &
    local compose_pid=$!

    # Show spinner while containers are starting
    local spin_chars='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local spin_i=0

    while kill -0 $compose_pid 2>/dev/null; do
        local spin_char="${spin_chars:$spin_i:1}"
        echo -ne "\r  ${CYAN}${spin_char} Starting PostgreSQL and SonarQube containers...${NC}   "
        spin_i=$(( (spin_i + 1) % ${#spin_chars} ))
        sleep 0.1
    done

    # Wait for the compose command to finish and get exit code
    wait $compose_pid
    local compose_exit=$?

    echo -ne "\r\033[K"  # Clear the spinner line

    if [ $compose_exit -eq 0 ]; then
        print_success "✓ PostgreSQL container started"
        print_success "✓ SonarQube container started"
        rm -f "$compose_log"
    else
        echo ""
        print_error "Container startup failed"
        print_info "Check log: $compose_log"
        return 1
    fi

    echo ""
    print_info "Running containers:"
    $CONTAINER_CMD ps --filter "name=bobthefixer"
    echo ""

    # Wait for SonarQube
    local max_wait=180
    local elapsed=0
    local api_found=false
    local api_msg_shown=false

    while [ $elapsed -lt $max_wait ]; do
        # Check API every 5 seconds
        if [ $((elapsed % 5)) -eq 0 ]; then
            if curl -s http://localhost:9000/api/system/health &> /dev/null; then
                if [ "$api_found" = false ]; then
                    api_found=true
                    api_msg_shown=true
                    echo -ne "\r\033[K"  # Clear line
                    print_step "SonarQube API ready, finalizing initialization..."
                fi

                # Now wait for authentication to be ready
                local init_wait=30
                local init_elapsed=0

                while [ $init_elapsed -lt $init_wait ]; do
                    # Check authentication every 3 seconds
                    if [ $((init_elapsed % 3)) -eq 0 ]; then
                        local status_code=$(curl -s -o /dev/null -w "%{http_code}" -u admin:admin \
                            "http://localhost:9000/api/authentication/validate" 2>/dev/null)

                        if [ "$status_code" = "200" ] || [ "$status_code" = "401" ]; then
                            echo -ne "\r\033[K"  # Clear line
                            print_success "SonarQube ready!"
                            echo ""
                            sleep 1
                            break 2  # Break both loops
                        fi
                    fi

                    echo -ne "\r  ${CYAN}⏳ Finalizing... ${init_elapsed}s${NC}   "
                    sleep 1
                    init_elapsed=$((init_elapsed + 1))
                done
            fi
        fi

        if [ "$api_found" = false ]; then
            echo -ne "\r  ${CYAN}⏳ Starting SonarQube... ${elapsed}s / ${max_wait}s${NC}   "
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    echo ""

    if [ $elapsed -ge $max_wait ]; then
        print_error "Timeout - SonarQube not responding"
        print_info "Check logs: $CONTAINER_CMD logs bobthefixer_sonarqube"
        return 1
    fi

    # Generate token
    local sonar_token=""
    local max_token_attempts=20

    for i in $(seq 1 $max_token_attempts); do
        echo -ne "\r  ${CYAN}⏳ Generating access token... attempt $i/$max_token_attempts${NC}   "

        # On first attempts, wait longer for slow machines
        if [ $i -le 3 ] && [ $i -gt 1 ]; then
            sleep 10
        fi

        # Use temporary file to capture response cleanly
        local temp_response="/tmp/sonar-token-response-$$.json"
        local http_code=$(curl -s -w "%{http_code}" -u admin:admin -X POST \
            "http://localhost:9000/api/user_tokens/generate" \
            -d "name=bobthefixer-$(date +%s)" \
            -o "$temp_response" 2>/dev/null)

        local response=$(cat "$temp_response" 2>/dev/null || echo "")

        # Debug: show response if verbose
        if [ ! -z "$VERBOSE" ]; then
            echo "HTTP Code: $http_code"
            echo "Response: $response"
        fi

        sonar_token=$(echo "$response" | jq -r '.token' 2>/dev/null || echo "")

        # Clean up temp file
        rm -f "$temp_response"

        if [ -n "$sonar_token" ] && [ "$sonar_token" != "null" ] && [ "$http_code" = "200" ]; then
            echo -ne "\r\033[K"  # Clear line
            print_success "Access token generated!"
            echo ""
            break
        fi

        # Check if authentication failed
        if [ "$http_code" = "401" ] || echo "$response" | grep -q "Unauthorized\|Authentication required\|Invalid credentials"; then
            # On early attempts, it might just be slow initialization
            if [ $i -le 5 ]; then
                sleep 10
                continue
            fi

            # After 5 attempts, ask user about password change
            echo ""
            print_warning "Persistent authentication issue (HTTP $http_code)"
            print_info "SonarQube may require password change on first login"
            print_info "Please open http://localhost:9000 in your browser and login with admin/admin"
            print_info "Then change the password if prompted"
            echo ""
            if ask_yes_no "Have you logged in and changed the password?" "n"; then
                local new_password=$(ask_string "Enter the new admin password" "" "")
                # Retry with new password
                http_code=$(curl -s -w "%{http_code}" -u admin:$new_password -X POST \
                    "http://localhost:9000/api/user_tokens/generate" \
                    -d "name=bobthefixer-$(date +%s)" \
                    -o "$temp_response" 2>/dev/null)
                response=$(cat "$temp_response" 2>/dev/null || echo "")
                sonar_token=$(echo "$response" | jq -r '.token' 2>/dev/null || echo "")
                rm -f "$temp_response"
                if [ -n "$sonar_token" ] && [ "$sonar_token" != "null" ] && [ "$http_code" = "200" ]; then
                    print_success "Token generated with new password!"
                    # Update credentials in .env later
                    SONAR_PASSWORD="$new_password"
                    break
                fi
            fi
        fi

        if [ $i -lt $max_token_attempts ]; then
            # Progressive delay: more time on slower machines
            if [ $i -le 3 ]; then
                sleep 8
            elif [ $i -le 10 ]; then
                sleep 5
            else
                sleep 3
            fi
        fi
    done

    if [ -z "$sonar_token" ] || [ "$sonar_token" = "null" ]; then
        echo ""
        print_error "Token generation failed after $max_token_attempts attempts"
        echo ""
        print_info "Last response from SonarQube:"
        echo "$response"
        echo ""
        print_info "Troubleshooting:"
        echo "  1. Check SonarQube logs: $CONTAINER_CMD logs bobthefixer_sonarqube"
        echo "  2. Visit http://localhost:9000 and verify you can login"
        echo "  3. Try generating token manually in SonarQube UI"
        return 1
    fi

    # Create .env file
    print_step "Saving configuration..."

    local encryption_key=$(openssl rand -hex 32 2>/dev/null || echo "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789")

    cat > "$SCRIPT_DIR/.env" << EOF
SONAR_URL=http://localhost:9000
SONAR_TOKEN=$sonar_token
SONAR_PROJECT_KEY_PREFIX=bobthefixer
NODE_ENV=development
LOG_LEVEL=info
RATE_LIMIT_ENABLED=true
ENCRYPTION_KEY=$encryption_key
LOG_FORMAT=text
LOG_FILE_PATH=./logs/mcp-server.log
HEALTH_CHECK_INTERVAL=30000
EOF

    mkdir -p "$SCRIPT_DIR/logs"

    print_success "Configuration saved"

    # Export for use in this script
    export SONAR_TOKEN="$sonar_token"
    export ENCRYPTION_KEY="$encryption_key"
}

# ============================================
# BUILD PROJECT
# ============================================

build_project() {
    log "Building project..."

    cd "$SCRIPT_DIR"

    # Install dependencies
    if [ ! -d "node_modules" ]; then
        print_step "Installing npm dependencies..."
        npm install
        print_success "Dependencies installed"
    else
        print_info "Dependencies already installed (using cache)"
    fi

    # Build
    print_step "Compiling TypeScript..."
    npm run build

    if [ ! -f "packages/core/dist/universal-mcp-server.js" ]; then
        print_error "Build failed - MCP server file not found"
        return 1
    fi

    print_success "Build completed!"
}

# ============================================
# INSTALL MCP SERVER
# ============================================

install_mcp_server() {
    # Disable exit on error for this function
    set +e

    log "Installing MCP server..."

    local mcp_server_path="$SCRIPT_DIR/packages/core/dist/universal-mcp-server.js"
    local clis_installed=0

    # Helper function to install MCP for CLI-based tools (Claude, Gemini)
    install_mcp_for_cli() {
        local cli_name=$1
        local cli_cmd=$2

        print_step "Installing Bob the Fixer in $cli_name..."

        # Remove existing installation (suppress output)
        $cli_cmd mcp remove bob-the-fixer &>/dev/null || true

        # Install with environment variables (suppress verbose output)
        if $cli_cmd mcp add bob-the-fixer node "$mcp_server_path" \
            --scope user \
            --env SONAR_URL=http://localhost:9000 \
            --env SONAR_TOKEN="$SONAR_TOKEN" \
            --env NODE_ENV=development \
            --env LOG_LEVEL=debug \
            --env LOG_FORMAT=text \
            --env RATE_LIMIT_ENABLED=true \
            --env HEALTH_CHECK_INTERVAL=30000 \
            --env LOG_FILE_PATH=/tmp/bobthefixer-mcp.log \
            --env TOKEN_ENCRYPTION_KEY="$ENCRYPTION_KEY" &>/dev/null; then

            print_success "✓ Configured for $cli_name"
            ((clis_installed++))
        else
            print_error "✗ Configuration failed for $cli_name"
        fi

        echo ""
    }

    # Helper function to install MCP for GitHub Copilot (JSON config)
    install_mcp_for_copilot() {
        print_step "Installing Bob the Fixer in GitHub Copilot..."

        if setup_copilot_mcp_config "$SCRIPT_DIR" "http://localhost:9000" "$SONAR_TOKEN" "$ENCRYPTION_KEY"; then
            print_success "✓ Configured for GitHub Copilot"
            ((clis_installed++))
        else
            print_error "✗ Configuration failed for GitHub Copilot"
        fi

        echo ""
    }

    # Helper function to install MCP for OpenAI Codex (requires timeout parameters)
    install_mcp_for_codex() {
        print_step "Installing Bob the Fixer in OpenAI Codex..."

        # Remove existing installation (suppress output)
        codex mcp remove bob-the-fixer &>/dev/null || true

        # Install using codex mcp add with environment variables (suppress verbose output)
        if codex mcp add bob-the-fixer \
            --env SONAR_URL=http://localhost:9000 \
            --env SONAR_TOKEN="$SONAR_TOKEN" \
            --env NODE_ENV=development \
            --env LOG_LEVEL=debug \
            --env LOG_FORMAT=json \
            --env RATE_LIMIT_ENABLED=true \
            --env HEALTH_CHECK_INTERVAL=30000 \
            --env LOG_FILE_PATH=/tmp/bobthefixer-mcp.log \
            --env TOKEN_ENCRYPTION_KEY="$ENCRYPTION_KEY" \
            -- node "$mcp_server_path" &>/dev/null; then

            # Add timeout parameters to Codex config (required for long-running scans)
            local codex_config="$HOME/.codex/config.toml"
            if [ -f "$codex_config" ]; then
                # Add timeout parameters after the args line
                if grep -q "^\[mcp_servers.bob-the-fixer\]" "$codex_config"; then
                    # Check if timeouts already exist
                    if ! grep -q "startup_timeout_ms" "$codex_config"; then
                        # Find the line with args and add timeouts after it
                        sed -i '/^\[mcp_servers.bob-the-fixer\]/,/^$/{
                            /^args = \[/a\
startup_timeout_ms = 30_000\
tool_timeout_sec = 600\
exec_timeout_ms = 600_000
                        }' "$codex_config" 2>/dev/null
                    fi
                fi
            fi

            print_success "✓ Configured for OpenAI Codex (with extended timeouts)"
            ((clis_installed++))
        else
            print_error "✗ Configuration failed for OpenAI Codex"
        fi

        echo ""
    }

    # Check and install for Claude
    if command -v claude &> /dev/null; then
        install_mcp_for_cli "Claude" "claude"
    fi

    # Check and install for Gemini
    if command -v gemini &> /dev/null; then
        install_mcp_for_cli "Gemini" "gemini"
    fi

    # Check and install for OpenAI Codex
    if command -v codex &> /dev/null; then
        install_mcp_for_codex
    fi

    # Check and install for GitHub Copilot
    if command -v npm &> /dev/null && npm list -g @github/copilot &> /dev/null; then
        install_mcp_for_copilot
    fi

    # Check results
    if [ $clis_installed -eq 0 ]; then
        print_warning "No AI CLI found"
        print_info "MCP server compiled but not installed globally"
        print_info "Install Claude, Gemini, OpenAI Codex, or GitHub Copilot and then run: ./setup-token.sh"
    fi

    # Re-enable exit on error
    set -e

    return 0
}

# ============================================
# VERIFICATION
# ============================================

verify_installation() {
    log "Verifying installation..."

    local checks_passed=0
    local checks_total=5

    # Check 1: Containers running
    print_step "Checking containers..."
    if podman ps 2>/dev/null | grep -q bobthefixer || docker ps 2>/dev/null | grep -q bobthefixer; then
        print_success "Containers active"
        ((checks_passed++))
    else
        print_error "Containers not found"
    fi

    # Check 2: SonarQube API
    print_step "Checking SonarQube API..."
    if curl -s http://localhost:9000/api/system/health &> /dev/null; then
        print_success "SonarQube API reachable"
        ((checks_passed++))
    else
        print_error "SonarQube API not responding"
    fi

    # Check 3: Token validity
    print_step "Checking token..."
    if [ -n "$SONAR_TOKEN" ]; then
        local response=$(curl -s -H "Authorization: Bearer $SONAR_TOKEN" \
            "http://localhost:9000/api/authentication/validate" 2>/dev/null || echo "")
        if echo "$response" | grep -q '"valid":true'; then
            print_success "Token valid"
            ((checks_passed++))
        else
            print_warning "Token not verifiable"
        fi
    fi

    # Check 4: MCP server built
    print_step "Checking MCP server build..."
    if [ -f "$SCRIPT_DIR/packages/core/dist/universal-mcp-server.js" ]; then
        print_success "MCP server compiled"
        ((checks_passed++))
    else
        print_error "MCP server not found"
    fi

    # Check 5: AI CLI integration
    print_step "Checking AI CLI integration..."
    local cli_found=false

    if command -v claude &> /dev/null; then
        if claude mcp list 2>/dev/null | grep -q bob-the-fixer; then
            print_success "Bob the Fixer registered in Claude"
            cli_found=true
        fi
    fi

    if command -v gemini &> /dev/null; then
        if gemini mcp list 2>/dev/null | grep -q bob-the-fixer; then
            print_success "Bob the Fixer registered in Gemini"
            cli_found=true
        fi
    fi

    if [ "$cli_found" = true ]; then
        ((checks_passed++))
    else
        print_warning "Bob the Fixer not registered in any AI CLI"
    fi

    echo ""
    print_info "Checks passed: $checks_passed/$checks_total"

    if [ $checks_passed -ge 4 ]; then
        print_success "Installation verified!"
        return 0
    else
        print_warning "Some checks failed - check the log"
        return 1
    fi
}

# ============================================
# SUCCESS SUMMARY
# ============================================

show_success_summary() {
    local install_duration=$(($(date +%s) - INSTALL_START_TIME))
    local minutes=$((install_duration / 60))
    local seconds=$((install_duration % 60))

    clear
    print_banner

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                          ║${NC}"
    echo -e "${GREEN}║          ${EMOJI_PARTY}${WHITE}BOB THE FIXER SUCCESSFULLY INSTALLED!${EMOJI_PARTY}${GREEN}       ║${NC}"
    echo -e "${GREEN}║                                                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    print_info "Installation time: ${minutes}m ${seconds}s"
    echo ""

    echo -e "${CYAN}📋 Configuration:${NC}"
    echo ""
    echo -e "  ${WHITE}SonarQube:${NC}       http://localhost:9000"
    echo -e "  ${WHITE}Login:${NC}           admin / admin"
    echo -e "  ${WHITE}Token:${NC}           $SONAR_TOKEN"
    echo -e "  ${WHITE}MCP Server:${NC}      $SCRIPT_DIR/packages/core/dist/universal-mcp-server.js"
    echo ""

    # Check if any CLIs detected (bash 3.2 compatible)
    if [ -n "$DETECTED_CLIS" ]; then
        echo -e "${CYAN}🤖 Installed AI CLIs:${NC}"
        echo ""
        # DETECTED_CLIS is a space-separated string
        for cli in $DETECTED_CLIS; do
            echo -e "  ${GREEN}✓${NC} $cli"
        done
        echo ""
    fi

    echo -e "${CYAN}Next Steps:${NC}"
    echo ""
    echo "  1. Open your project"
    echo "  2. Run: claude"
    echo "  3. Ask: \"Analyze this project with Bob the Fixer\""
    echo ""

    echo -e "${CYAN}📚 Useful Resources:${NC}"
    echo ""
    echo "  • Documentation: $SCRIPT_DIR/docs/"
    echo "  • Installation log: $LOG_FILE"
    echo "  • SonarQube Web UI: http://localhost:9000"
    echo ""

    if command -v claude &> /dev/null; then
        echo -e "${CYAN}📋 Registered MCP Servers:${NC}"
        echo ""
        claude mcp list 2>/dev/null || true
        echo ""
    fi

    echo -e "${GREEN}✨ Happy coding with Bob the Fixer! ✨${NC}"
    echo ""
}

# ============================================
# RUN MAIN
# ============================================

main "$@"
