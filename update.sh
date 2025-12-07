#!/bin/bash
# Bob the Fixer - Update Script
# Intelligent update based on release type metadata
#
# Usage:
#   ./update.sh              # Auto-detect update type from GitHub release metadata
#   ./update.sh --check      # Check for updates without applying
#   ./update.sh --dry-run    # Show what would be done without executing
#   ./update.sh --force      # Bypass dirty git state check
#   ./update.sh --help       # Show help

set -e

# ============================================
# CONFIGURATION
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITHUB_REPO="andrearaponi/bob-the-fixer"
GITHUB_API="https://api.github.com/repos/$GITHUB_REPO/releases/latest"

# ============================================
# LOAD LIBRARIES
# ============================================
if [[ -f "$SCRIPT_DIR/lib/colors.sh" ]]; then
    source "$SCRIPT_DIR/lib/colors.sh"
else
    # Fallback colors if lib not found
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    RED='\033[0;31m'
    CYAN='\033[0;36m'
    NC='\033[0m'
    print_success() { echo -e "${GREEN}$1${NC}"; }
    print_error() { echo -e "${RED}$1${NC}"; }
    print_warning() { echo -e "${YELLOW}$1${NC}"; }
    print_info() { echo -e "${CYAN}$1${NC}"; }
    print_step() { echo -e "${CYAN}$1${NC}"; }
    print_header() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}\n"; }
fi

if [[ -f "$SCRIPT_DIR/lib/os-detect.sh" ]]; then
    source "$SCRIPT_DIR/lib/os-detect.sh"
fi

# ============================================
# CLI ARGUMENT PARSING
# ============================================
FORCE_UPDATE=false
DRY_RUN=false
CHECK_ONLY=false

show_help() {
    echo "Bob the Fixer - Update Script"
    echo ""
    echo "Usage: ./update.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --check      Check for updates without applying"
    echo "  --dry-run    Show what would be done without executing"
    echo "  --force      Bypass dirty git state check"
    echo "  --help, -h   Show this help message"
    echo ""
    echo "Update Types (auto-detected from release metadata):"
    echo "  core   - Code update only (git pull + npm install + build)"
    echo "  infra  - Includes container changes (+ restart containers)"
    echo "  full   - Breaking changes (shows migration guide)"
    echo ""
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --force)
            FORCE_UPDATE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --check)
            CHECK_ONLY=true
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# ============================================
# VALIDATION FUNCTIONS
# ============================================

validate_environment() {
    # Check if in bob-the-fixer repo
    if [[ ! -f "$SCRIPT_DIR/package.json" ]]; then
        print_error "Not in bob-the-fixer repository"
        print_info "Run this script from the bob-the-fixer directory"
        exit 1
    fi

    if ! grep -q '"name": "bob-the-fixer"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
        print_error "Not in bob-the-fixer repository"
        exit 1
    fi

    # Check git is available
    if ! command -v git &> /dev/null; then
        print_error "Git not found. Please install git first."
        exit 1
    fi

    # Check for uncommitted changes (unless --force)
    if [[ "$FORCE_UPDATE" != true ]]; then
        if ! git -C "$SCRIPT_DIR" diff-index --quiet HEAD -- 2>/dev/null; then
            print_error "Uncommitted changes detected"
            print_info "Commit or stash changes, or use --force to override"
            exit 1
        fi
    fi

    # Check required tools
    if ! command -v curl &> /dev/null; then
        print_error "curl not found. Please install curl first."
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        print_error "jq not found. Please install jq first."
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm not found. Please install Node.js and npm first."
        exit 1
    fi
}

# ============================================
# GITHUB API FUNCTIONS
# ============================================

fetch_release_info() {
    local response
    response=$(curl -s -H "Accept: application/vnd.github+json" \
        -H "User-Agent: bob-the-fixer-updater" \
        "$GITHUB_API" 2>/dev/null)

    if [[ -z "$response" ]]; then
        print_error "Failed to fetch release info from GitHub (empty response)"
        exit 1
    fi

    if echo "$response" | jq -e '.message' &>/dev/null; then
        local message
        message=$(echo "$response" | jq -r '.message')
        print_error "GitHub API error: $message"
        exit 1
    fi

    echo "$response"
}

parse_release_metadata() {
    local release_body="$1"

    # Extract JSON from metadata block using sed
    local metadata
    metadata=$(echo "$release_body" | \
        sed -n '/<!-- BOB_RELEASE_METADATA/,/-->/p' | \
        sed '1d;$d' | \
        tr -d '\n' | \
        sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    if [[ -z "$metadata" ]]; then
        # No metadata found - return default
        echo '{"updateType": "full"}'
    else
        echo "$metadata"
    fi
}

get_current_version() {
    local pkg_version
    pkg_version=$(node -p "require('$SCRIPT_DIR/package.json').version" 2>/dev/null || echo "0.0.0")
    echo "$pkg_version"
}

# ============================================
# UPDATE FUNCTIONS
# ============================================

perform_core_update() {
    print_header "CORE UPDATE"
    print_info "Updating code only (git pull + npm install + build)"
    echo ""

    if [[ "$DRY_RUN" == true ]]; then
        print_warning "[DRY RUN] Would execute:"
        echo "  cd $SCRIPT_DIR"
        echo "  git pull origin main"
        echo "  npm install"
        echo "  npm run build"
        return 0
    fi

    print_step "Pulling latest changes..."
    git -C "$SCRIPT_DIR" pull origin main

    print_step "Installing dependencies..."
    cd "$SCRIPT_DIR"
    npm install

    print_step "Building project..."
    npm run build

    print_success "Core update completed!"
}

perform_infra_update() {
    print_header "INFRASTRUCTURE UPDATE"
    print_info "Updating code and containers"
    echo ""

    local COMPOSE_FILE="$SCRIPT_DIR/infrastructure/podman-compose.yml"
    local COMPOSE_CMD=""

    # Detect container runtime
    if command -v podman &> /dev/null; then
        if command -v podman-compose &> /dev/null; then
            COMPOSE_CMD="podman-compose -p bobthefixer -f $COMPOSE_FILE"
        else
            print_error "podman-compose not found"
            exit 1
        fi
    elif command -v docker &> /dev/null; then
        COMPOSE_CMD="docker compose -p bobthefixer -f $COMPOSE_FILE"
    else
        print_error "No container runtime found (podman or docker)"
        exit 1
    fi

    if [[ "$DRY_RUN" == true ]]; then
        print_warning "[DRY RUN] Would execute:"
        echo "  $COMPOSE_CMD down"
        echo "  git pull origin main"
        echo "  npm install && npm run build"
        echo "  $COMPOSE_CMD pull"
        echo "  $COMPOSE_CMD up -d"
        return 0
    fi

    # Stop containers (preserve volumes)
    print_step "Stopping containers..."
    $COMPOSE_CMD down 2>/dev/null || true

    # Perform core update
    print_step "Pulling latest changes..."
    git -C "$SCRIPT_DIR" pull origin main

    print_step "Installing dependencies..."
    cd "$SCRIPT_DIR"
    npm install

    print_step "Building project..."
    npm run build

    # Pull new images
    print_step "Pulling new container images..."
    $COMPOSE_CMD pull

    # Start containers
    print_step "Starting containers..."
    $COMPOSE_CMD up -d

    # Wait for SonarQube
    print_step "Waiting for SonarQube to be ready..."
    wait_for_sonarqube

    print_success "Infrastructure update completed!"
}

perform_full_update() {
    print_header "FULL UPDATE REQUIRED"

    print_warning "This release contains breaking changes"
    echo ""
    print_info "Please follow these steps:"
    echo ""
    echo "  1. Save your current configuration:"
    echo "     cp .env .env.backup"
    echo ""
    echo "  2. Uninstall current version:"
    echo "     ./uninstall.sh"
    echo ""
    echo "  3. Pull the latest code:"
    echo "     git pull origin main"
    echo ""
    echo "  4. Run the installer:"
    echo "     ./install.sh"
    echo ""
    echo "  5. Restore any custom configuration from .env.backup"
    echo ""

    if [[ -n "$REQUIRED_ACTIONS" ]]; then
        print_warning "Additional required actions:"
        echo "$REQUIRED_ACTIONS"
    fi
}

wait_for_sonarqube() {
    local max_wait=180
    local elapsed=0

    while [[ $elapsed -lt $max_wait ]]; do
        if curl -s http://localhost:9000/api/system/health &> /dev/null; then
            echo ""
            print_success "SonarQube is ready"
            return 0
        fi
        echo -ne "\r  Waiting... ${elapsed}s / ${max_wait}s"
        sleep 5
        elapsed=$((elapsed + 5))
    done

    echo ""
    print_warning "SonarQube did not become ready in time"
    print_info "You may need to check: podman logs bobthefixer_sonarqube"
    return 1
}

# Version comparison helper
version_gt() {
    # Returns 0 (true) if $1 > $2
    test "$(printf '%s\n' "$1" "$2" | sort -V | head -n1)" != "$1"
}

# ============================================
# MAIN EXECUTION
# ============================================

main() {
    echo ""
    echo -e "${CYAN}Bob the Fixer - Update Script${NC}"
    echo ""

    # Validate environment
    validate_environment

    # Fetch release info
    print_step "Fetching release information..."
    RELEASE_JSON=$(fetch_release_info)

    LATEST_VERSION=$(echo "$RELEASE_JSON" | jq -r '.tag_name' | sed 's/^v//')
    RELEASE_URL=$(echo "$RELEASE_JSON" | jq -r '.html_url')
    RELEASE_BODY=$(echo "$RELEASE_JSON" | jq -r '.body // ""')

    CURRENT_VERSION=$(get_current_version)

    echo ""
    print_info "Current version: v$CURRENT_VERSION"
    print_info "Latest version:  v$LATEST_VERSION"
    echo ""

    # Check if update needed
    if [[ "$CURRENT_VERSION" == "$LATEST_VERSION" ]]; then
        print_success "Already up to date!"
        exit 0
    fi

    if ! version_gt "$LATEST_VERSION" "$CURRENT_VERSION"; then
        print_success "Already up to date (or ahead)!"
        exit 0
    fi

    # Parse metadata
    METADATA=$(parse_release_metadata "$RELEASE_BODY")
    UPDATE_TYPE=$(echo "$METADATA" | jq -r '.updateType // "full"')
    MIN_VERSION=$(echo "$METADATA" | jq -r '.minVersion // ""')
    BREAKING=$(echo "$METADATA" | jq -r '.breakingChanges // false')
    NOTES=$(echo "$METADATA" | jq -r '.notes // ""')
    REQUIRED_ACTIONS=$(echo "$METADATA" | jq -r '.requiredActions // [] | join("\n  - ")')

    # Validate minimum version if specified
    if [[ -n "$MIN_VERSION" ]] && [[ "$MIN_VERSION" != "null" ]]; then
        if version_gt "$MIN_VERSION" "$CURRENT_VERSION"; then
            print_error "Your version ($CURRENT_VERSION) is too old for this update"
            print_info "Minimum required version: $MIN_VERSION"
            print_info "Please run a full reinstallation with ./install.sh"
            exit 1
        fi
    fi

    # Show update info
    case "$UPDATE_TYPE" in
        core)
            print_info "Update type: core (Code update only)"
            ;;
        infra)
            print_info "Update type: infra (Includes container changes)"
            ;;
        full)
            print_info "Update type: full (Breaking changes)"
            ;;
        *)
            print_info "Update type: $UPDATE_TYPE (unknown, treating as full)"
            UPDATE_TYPE="full"
            ;;
    esac

    if [[ -n "$NOTES" ]] && [[ "$NOTES" != "null" ]]; then
        print_info "Notes: $NOTES"
    fi
    echo ""

    # Check only mode
    if [[ "$CHECK_ONLY" == true ]]; then
        print_info "Update available: v$CURRENT_VERSION -> v$LATEST_VERSION"
        print_info "Type: $UPDATE_TYPE"
        print_info "Release: $RELEASE_URL"
        exit 0
    fi

    # Confirm update (unless dry-run)
    if [[ "$DRY_RUN" != true ]]; then
        read -p "Proceed with $UPDATE_TYPE update? [Y/n] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]?$ ]]; then
            print_info "Update cancelled"
            exit 0
        fi
    fi

    # Execute update
    case "$UPDATE_TYPE" in
        core)
            perform_core_update
            ;;
        infra)
            perform_infra_update
            ;;
        full)
            perform_full_update
            exit 0  # Full update shows guide, doesn't auto-execute
            ;;
    esac

    echo ""
    print_success "Updated to v$LATEST_VERSION!"
    print_info "Release notes: $RELEASE_URL"
}

# Run main
main "$@"
