#!/bin/bash

# 🔄 Rollback Utilities
# Handles cleanup and rollback in case of installation failures

# Load required libraries
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/colors.sh"
source "$LIB_DIR/prompt-utils.sh"

# Track installation state
ROLLBACK_STATE_FILE="/tmp/bob-installer-state.txt"
ROLLBACK_LOG_FILE="/tmp/bob-installer-rollback.log"

# Initialize rollback tracking
init_rollback() {
    echo "# Bob the Fixer - Installation State" > "$ROLLBACK_STATE_FILE"
    echo "# Created: $(date)" >> "$ROLLBACK_STATE_FILE"
    echo "" >> "$ROLLBACK_STATE_FILE"
    print_info "Rollback tracking initialized"
}

# Record an action for potential rollback
record_action() {
    local action_type=$1
    local action_data=$2

    echo "$action_type|$action_data|$(date +%s)" >> "$ROLLBACK_STATE_FILE"
}

# Clean rollback state
clean_rollback_state() {
    rm -f "$ROLLBACK_STATE_FILE" "$ROLLBACK_LOG_FILE"
}

# Stop and remove containers
rollback_containers() {
    print_step "Removing containers..."

    # Detect container runtime
    local CONTAINER_CMD=""
    if command -v podman &> /dev/null; then
        CONTAINER_CMD="podman"
    elif command -v docker &> /dev/null; then
        CONTAINER_CMD="docker"
    fi

    if [ -z "$CONTAINER_CMD" ]; then
        print_warning "No container runtime found"
        return
    fi

    # Stop containers
    $CONTAINER_CMD stop bobthefixer_sonarqube bobthefixer_postgres 2>/dev/null && \
        print_success "Containers stopped"

    # Remove containers
    $CONTAINER_CMD rm bobthefixer_sonarqube bobthefixer_postgres 2>/dev/null && \
        print_success "Containers removed"

    # Remove volumes
    if ask_yes_no "Remove volumes (persistent data) as well?"; then
        $CONTAINER_CMD volume rm bobthefixer_postgres_data \
            bobthefixer_sonarqube_data \
            bobthefixer_sonarqube_extensions \
            bobthefixer_sonarqube_logs 2>/dev/null && \
            print_success "Volumes removed"
    fi

    # Remove network
    $CONTAINER_CMD network rm bobthefixer_network 2>/dev/null && \
        print_success "Network removed"
}

# Remove MCP server installation
rollback_mcp() {
    print_step "Removing MCP server from Claude..."

    if command -v claude &> /dev/null; then
        if claude mcp remove bob-the-fixer 2>/dev/null; then
            print_success "MCP server removed from Claude"
        else
            print_warning "MCP server not found or already removed"
        fi
    fi
}

# Remove environment files
rollback_env_files() {
    print_step "Removing configuration files..."

    local files_removed=0

    if [ -f ".env" ]; then
        rm .env
        print_success ".env removed"
        ((files_removed++))
    fi

    if [ -f ".env.backup"* ]; then
        rm .env.backup*
        print_success ".env backups removed"
        ((files_removed++))
    fi

    if [ -d "logs" ]; then
        rm -rf logs
        print_success "Logs directory removed"
        ((files_removed++))
    fi

    if [ $files_removed -eq 0 ]; then
        print_info "No configuration files to remove"
    fi
}

# Remove built files
rollback_build() {
    print_step "Removing built files..."

    if [ -d "packages/core/dist" ]; then
        rm -rf packages/core/dist
        print_success "Build removed"
    fi

    if [ -d "node_modules" ]; then
        if ask_yes_no "Remove node_modules?"; then
            rm -rf node_modules
            print_success "node_modules removed"
        fi
    fi
}

# Restore backup files
restore_backups() {
    print_step "Restoring backups..."

    # Restore compose file backups
    if ls infrastructure/podman-compose.yml.backup.* &> /dev/null; then
        local latest_backup=$(ls -t infrastructure/podman-compose.yml.backup.* | head -1)
        if ask_yes_no "Restore compose backup: $(basename $latest_backup)?"; then
            cp "$latest_backup" infrastructure/podman-compose.yml
            print_success "Compose file restored"
        fi
    fi

    # Restore other backups if any
    if ls *.backup.* &> /dev/null; then
        print_info "Other backups found:"
        ls *.backup.*
    fi
}

# Complete rollback
perform_full_rollback() {
    print_header "${EMOJI_CLEAN} INSTALLATION ROLLBACK"

    print_warning "This will remove all installation changes"
    echo ""

    if ! confirm_action "Are you sure you want to proceed with rollback?" "ROLLBACK"; then
        print_info "Rollback cancelled"
        return 1
    fi

    echo ""
    print_step "Starting rollback..."
    echo ""

    rollback_containers
    rollback_mcp
    rollback_env_files
    rollback_build
    restore_backups

    echo ""
    print_success "Rollback completed!"
    echo ""

    # Show what was done
    if [ -f "$ROLLBACK_LOG_FILE" ]; then
        echo -e "${CYAN}Rollback log saved to:${NC}"
        echo "  $ROLLBACK_LOG_FILE"
        echo ""
    fi

    clean_rollback_state
}

# Partial cleanup (keep data but clean failed state)
perform_partial_cleanup() {
    print_header "${EMOJI_CLEAN} PARTIAL CLEANUP"

    print_info "This stops containers but keeps data"
    echo ""

    # Detect container runtime
    local CONTAINER_CMD=""
    if command -v podman &> /dev/null; then
        CONTAINER_CMD="podman"
    elif command -v docker &> /dev/null; then
        CONTAINER_CMD="docker"
    fi

    if [ -n "$CONTAINER_CMD" ]; then
        $CONTAINER_CMD stop bobthefixer_sonarqube bobthefixer_postgres 2>/dev/null
        print_success "Containers stopped (data preserved)"
    fi

    rollback_env_files

    print_success "Partial cleanup completed!"
}

# Error handler - called on script failure
on_error() {
    local exit_code=$?
    local line_number=$1

    echo ""
    print_error "Installation error at line $line_number (exit code: $exit_code)"
    echo ""

    # Log error
    echo "$(date): Error at line $line_number (exit code: $exit_code)" >> "$ROLLBACK_LOG_FILE"

    # Save log file reference
    local log_file="/tmp/bob-install-$(date +%Y%m%d_%H%M%S).log"
    if [ -f "$log_file" ]; then
        echo -e "${CYAN}Full log:${NC} $log_file"
        echo ""
    fi

    # Ask user what to do
    echo -e "${YELLOW}What do you want to do?${NC}"
    echo "  1) Full rollback (remove everything)"
    echo "  2) Partial cleanup (keep data)"
    echo "  3) Nothing (analyze manually)"
    echo ""

    read -t 30 -p "Choice [1-3] (default: 3 in 30s): " choice || choice=3

    case $choice in
        1)
            perform_full_rollback
            ;;
        2)
            perform_partial_cleanup
            ;;
        3)
            print_info "No rollback performed"
            echo ""
            echo "To rollback manually:"
            echo "  source lib/rollback.sh && perform_full_rollback"
            ;;
    esac

    exit $exit_code
}

# Cleanup temporary files
cleanup_temp_files() {
    print_step "Cleaning temporary files..."

    # Remove temp installation files
    rm -f /tmp/bob-*.log 2>/dev/null
    rm -f /tmp/get-docker.sh 2>/dev/null
    rm -f /tmp/sonar-scanner.zip 2>/dev/null

    print_success "Temporary files removed"
}

# Show rollback status
show_rollback_status() {
    if [ -f "$ROLLBACK_STATE_FILE" ]; then
        print_info "Installation state:"
        echo ""
        cat "$ROLLBACK_STATE_FILE"
        echo ""
    else
        print_info "No installation state found"
    fi
}

# Export functions for use in main script
export -f init_rollback
export -f record_action
export -f perform_full_rollback
export -f perform_partial_cleanup
export -f on_error
export -f cleanup_temp_files
