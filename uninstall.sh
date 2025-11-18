#!/bin/bash

# Bob the Fixer - UNINSTALLER
# Removes Bob the Fixer containers, configurations, and MCP server registrations
#
# Usage:
#   ./uninstall.sh

set -e

# ============================================
# TERMINAL COMPATIBILITY FIX
# ============================================
if [ -n "$TERM" ] && ! infocmp "$TERM" >/dev/null 2>&1; then
    export TERM=xterm-256color
fi

# ============================================
# SETUP
# ============================================

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load library modules
source "$SCRIPT_DIR/lib/colors.sh"
source "$SCRIPT_DIR/lib/prompt-utils.sh"
source "$SCRIPT_DIR/lib/os-detect.sh"
source "$SCRIPT_DIR/lib/copilot-mcp-config.sh"

# Global variables
LOG_FILE="/tmp/bob-uninstall-$(date +%Y%m%d_%H%M%S).log"
UNINSTALL_START_TIME=$(date +%s)

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# ============================================
# MAIN UNINSTALLATION FLOW
# ============================================

main() {
    print_banner
    log "Uninstallation started"

    echo ""
    echo -e "${YELLOW}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║                                                          ║${NC}"
    echo -e "${YELLOW}║                ${WHITE}BOB THE FIXER UNINSTALLER${YELLOW}                 ║${NC}"
    echo -e "${YELLOW}║                                                          ║${NC}"
    echo -e "${YELLOW}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    print_warning "This will remove Bob the Fixer from your system:"
    echo ""
    echo "  - SonarQube and PostgreSQL containers"
    echo "  - Container volumes (data will be lost)"
    echo "  - MCP server registration from AI CLIs"
    echo "  - Bob configuration files (.env, logs)"
    echo "  - Build output (dist folders)"
    echo "  - Node.js dependencies (node_modules)"
    echo ""
    print_info "This will NOT remove:"
    echo ""
    echo "  - Docker/Podman"
    echo "  - AI CLIs (Claude, Gemini, GitHub Copilot)"
    echo "  - Node.js and npm"
    echo "  - Source code"
    echo ""

    if ! ask_yes_no "Are you sure you want to uninstall Bob the Fixer?" "n"; then
        print_info "Uninstallation cancelled"
        exit 0
    fi

    echo ""

    # Step 1: Detect and remove containers
    print_header "${EMOJI_DOCKER} STEP 1/4: REMOVING CONTAINERS"
    remove_containers
    pause

    # Step 2: Remove MCP server from CLIs
    print_header "${EMOJI_ROBOT} STEP 2/4: REMOVING MCP SERVER"
    remove_mcp_server
    pause

    # Step 3: Clean configuration files
    print_header "${EMOJI_WRENCH} STEP 3/4: CLEANING CONFIGURATION"
    clean_configuration
    pause

    # Step 4: Verification
    print_header "${EMOJI_TEST} STEP 4/4: VERIFICATION"
    verify_removal
    pause

    # Success!
    show_success_summary

    log "Uninstallation completed successfully"
}

# ============================================
# REMOVE CONTAINERS
# ============================================

remove_containers() {
    log "Removing containers..."

    # Detect container runtime
    local CONTAINER_CMD=""
    local COMPOSE_CMD=""
    local COMPOSE_FILE="$SCRIPT_DIR/infrastructure/podman-compose.yml"

    if command -v podman &> /dev/null; then
        CONTAINER_CMD="podman"
        COMPOSE_CMD="podman-compose -p bobthefixer -f $COMPOSE_FILE"
        print_info "Using Podman"
    elif command -v docker &> /dev/null; then
        CONTAINER_CMD="docker"
        COMPOSE_CMD="docker compose -p bobthefixer -f $COMPOSE_FILE"
        print_info "Using Docker"
    else
        print_warning "No container runtime found - skipping container removal"
        return 0
    fi

    # Check if containers exist
    if ! $CONTAINER_CMD ps -a 2>/dev/null | grep -q bobthefixer; then
        print_info "No Bob the Fixer containers found"
        return 0
    fi

    echo ""
    print_step "Found Bob the Fixer containers:"
    $CONTAINER_CMD ps -a --filter "name=bobthefixer" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""

    print_step "Stopping containers..."
    $COMPOSE_CMD down --volumes 2>/dev/null || {
        print_warning "Compose down failed, trying manual cleanup..."
        $CONTAINER_CMD stop bobthefixer_postgres bobthefixer_sonarqube 2>/dev/null || true
    }
    print_success "Containers stopped"

    print_step "Removing containers..."
    $CONTAINER_CMD rm bobthefixer_postgres bobthefixer_sonarqube 2>/dev/null || true
    print_success "Containers removed"

    print_step "Removing volumes..."
    # Volumes are explicitly named with bobthefixer_ prefix in podman-compose.yml
    $CONTAINER_CMD volume rm \
        bobthefixer_postgres_data \
        bobthefixer_sonarqube_data \
        bobthefixer_sonarqube_extensions \
        bobthefixer_sonarqube_logs 2>/dev/null || true
    print_success "Volumes removed"

    echo ""
    print_success "All containers cleaned up!"
}

# ============================================
# REMOVE MCP SERVER
# ============================================

remove_mcp_server() {
    # Disable exit on error for this function
    set +e

    log "Removing MCP server..."

    local clis_cleaned=0

    # Helper function to remove MCP from CLI-based tools (Claude, Gemini)
    remove_mcp_from_cli() {
        local cli_name=$1
        local cli_cmd=$2

        if ! command -v $cli_cmd &> /dev/null; then
            return 0
        fi

        # Check if Bob is registered (suppress output)
        if ! $cli_cmd mcp list 2>/dev/null | grep -q bob-the-fixer; then
            return 0
        fi

        print_step "Removing Bob the Fixer from $cli_name..."
        # Try with --scope user first (required for Gemini), fallback to without scope
        if $cli_cmd mcp remove bob-the-fixer --scope user &>/dev/null || \
           $cli_cmd mcp remove bob-the-fixer &>/dev/null; then
            print_success "✓ Removed from $cli_name"
            ((clis_cleaned++))
        else
            print_warning "✗ Failed to remove from $cli_name"
            print_info "  You may need to manually run: $cli_cmd mcp remove bob-the-fixer --scope user"
        fi
        echo ""
    }

    # Helper function to remove MCP from GitHub Copilot (JSON config)
    remove_mcp_from_copilot() {
        if ! command -v npm &> /dev/null || ! npm list -g @github/copilot &> /dev/null; then
            return 0
        fi

        if ! check_copilot_mcp_config; then
            return 0
        fi

        print_step "Removing Bob the Fixer from GitHub Copilot..."
        if remove_copilot_mcp_config 2>/dev/null; then
            print_success "✓ Removed from GitHub Copilot"
            ((clis_cleaned++))
        else
            print_warning "✗ Failed to remove from GitHub Copilot"
        fi
        echo ""
    }

    # Check and remove from Claude
    remove_mcp_from_cli "Claude" "claude"

    # Check and remove from Gemini
    remove_mcp_from_cli "Gemini" "gemini"

    # Check and remove from OpenAI Codex
    remove_mcp_from_cli "OpenAI Codex" "codex"

    # Check and remove from GitHub Copilot
    remove_mcp_from_copilot

    if [ $clis_cleaned -eq 0 ]; then
        print_info "No MCP server registrations found"
    else
        print_success "Removed from $clis_cleaned AI CLI(s)"
    fi

    # Re-enable exit on error
    set -e
}

# ============================================
# CLEAN CONFIGURATION
# ============================================

clean_configuration() {
    log "Cleaning configuration..."

    cd "$SCRIPT_DIR"

    local files_removed=0

    # Remove .env file
    if [ -f ".env" ]; then
        print_step "Removing .env file..."
        rm -f .env
        print_success ".env removed"
        ((files_removed++))
    else
        print_info ".env not found"
    fi

    # Remove logs directory
    if [ -d "logs" ]; then
        print_step "Removing logs directory..."
        rm -rf logs
        print_success "logs/ removed"
        ((files_removed++))
    else
        print_info "logs/ not found"
    fi

    # Remove build output
    if [ -d "packages/core/dist" ]; then
        print_step "Removing build output..."
        rm -rf packages/core/dist
        print_success "dist/ removed"
        ((files_removed++))
    else
        print_info "dist/ not found"
    fi

    # Remove node_modules directories
    local node_modules_found=false
    if [ -d "node_modules" ] || [ -d "packages/core/node_modules" ]; then
        node_modules_found=true
        print_step "Removing node_modules directories..."

        # Root node_modules
        if [ -d "node_modules" ]; then
            rm -rf node_modules
            print_success "node_modules/ removed"
            ((files_removed++))
        fi

        # Core node_modules
        if [ -d "packages/core/node_modules" ]; then
            rm -rf packages/core/node_modules
            print_success "packages/core/node_modules/ removed"
            ((files_removed++))
        fi
    else
        print_info "node_modules/ not found"
    fi

    echo ""

    if [ $files_removed -eq 0 ]; then
        print_info "No configuration files found"
    else
        print_success "Cleaned $files_removed configuration file(s)/directory(ies)"
    fi
}

# ============================================
# VERIFICATION
# ============================================

verify_removal() {
    log "Verifying removal..."

    local checks_passed=0
    local checks_total=3

    # Check 1: Containers removed
    print_step "Checking containers..."
    local container_found=false
    if command -v podman &> /dev/null; then
        if podman ps -a 2>/dev/null | grep -q bobthefixer; then
            container_found=true
        fi
    elif command -v docker &> /dev/null; then
        if docker ps -a 2>/dev/null | grep -q bobthefixer; then
            container_found=true
        fi
    fi

    if [ "$container_found" = false ]; then
        print_success "No containers found"
        ((checks_passed++))
    else
        print_warning "Some containers still exist"
    fi

    # Check 2: MCP server removed from CLIs
    print_step "Checking MCP server registration..."
    local mcp_found=false

    if command -v claude &> /dev/null; then
        if claude mcp list 2>/dev/null | grep -q bob-the-fixer; then
            mcp_found=true
        fi
    fi

    if command -v gemini &> /dev/null; then
        if gemini mcp list 2>/dev/null | grep -q bob-the-fixer; then
            mcp_found=true
        fi
    fi

    if [ "$mcp_found" = false ]; then
        print_success "MCP server not registered"
        ((checks_passed++))
    else
        print_warning "MCP server still registered in some CLIs"
    fi

    # Check 3: Configuration files removed
    print_step "Checking configuration files..."
    if [ ! -f ".env" ] && [ ! -d "logs" ] && [ ! -d "packages/core/dist" ] && \
       [ ! -d "node_modules" ] && [ ! -d "packages/core/node_modules" ]; then
        print_success "Configuration files removed"
        ((checks_passed++))
    else
        print_warning "Some configuration files still exist"
    fi

    echo ""
    print_info "Checks passed: $checks_passed/$checks_total"

    if [ $checks_passed -eq $checks_total ]; then
        print_success "Removal verified!"
        return 0
    else
        print_warning "Some items may require manual cleanup"
        return 1
    fi
}

# ============================================
# SUCCESS SUMMARY
# ============================================

show_success_summary() {
    local uninstall_duration=$(($(date +%s) - UNINSTALL_START_TIME))
    local seconds=$uninstall_duration

    clear
    print_banner

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                          ║${NC}"
    echo -e "${GREEN}║          ${WHITE}BOB THE FIXER SUCCESSFULLY REMOVED!${GREEN}             ║${NC}"
    echo -e "${GREEN}║                                                          ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    print_info "Uninstallation time: ${seconds}s"
    echo ""

    echo -e "${CYAN}🗑️  Removed:${NC}"
    echo ""
    echo -e "  ${GREEN}✓${NC} SonarQube and PostgreSQL containers"
    echo -e "  ${GREEN}✓${NC} Container volumes"
    echo -e "  ${GREEN}✓${NC} MCP server registrations"
    echo -e "  ${GREEN}✓${NC} Configuration files (.env, logs)"
    echo -e "  ${GREEN}✓${NC} Build output (dist)"
    echo -e "  ${GREEN}✓${NC} Node.js dependencies (node_modules)"
    echo ""

    echo -e "${CYAN}📝 Still available:${NC}"
    echo ""
    echo -e "  • Source code: $SCRIPT_DIR"
    echo -e "  • Installation log: $LOG_FILE"
    echo ""

    echo -e "${CYAN}💡 To reinstall:${NC}"
    echo ""
    echo "  ./install.sh"
    echo ""

    echo -e "${GREEN}✨ Bob the Fixer has been removed. Goodbye! ✨${NC}"
    echo ""
}

# ============================================
# RUN MAIN
# ============================================

main "$@"
