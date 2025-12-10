#!/bin/bash

# 🤖 AI CLI Installer
# Detects and installs AI CLI tools (Claude, Gemini, GitHub Copilot)

# Load required libraries
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/colors.sh"
source "$LIB_DIR/prompt-utils.sh"
source "$LIB_DIR/os-detect.sh"

# Track detected CLIs (space-separated string for bash 3.2 compatibility)
DETECTED_CLIS=""

# Helper function for npm global install with proper permissions
npm_install_global() {
    local package=$1

    # Try normal install first
    if npm install -g "$package" 2>/dev/null; then
        return 0
    fi

    # If failed, check if we're on Linux and need sudo
    if [ "$OS_TYPE" = "linux" ]; then
        print_warning "Permission denied - trying with sudo..."
        if sudo npm install -g "$package"; then
            return 0
        fi
    fi

    # If still failed, suggest alternative
    print_error "Global installation failed!"
    echo ""
    echo "Alternatives:"
    echo "1. Fix npm permissions: https://docs.npmjs.com/resolving-eacces-permissions-errors"
    echo "2. Use npx instead of global install"
    echo "3. Install with: sudo npm install -g $package"
    return 1
}

# Check if CLI is already in list (bash 3.2 compatible)
is_cli_detected() {
    local cli=$1
    case " $DETECTED_CLIS " in
        *" $cli "*) return 0 ;;
        *) return 1 ;;
    esac
}

# Add CLI to detected list (bash 3.2 compatible)
add_detected_cli() {
    local cli=$1
    if ! is_cli_detected "$cli"; then
        DETECTED_CLIS="$DETECTED_CLIS $cli"
    fi
}

# Detect all AI CLIs
detect_ai_clis() {

    DETECTED_CLIS=""

    # Claude CLI
    if command -v claude &> /dev/null; then
        local version=$(claude --version 2>/dev/null | head -1 || echo "installed")
        echo -e "  ${GREEN}Claude CLI:${NC} $version"
        add_detected_cli "claude"
    fi

    # Gemini CLI (there might be various implementations)
    if command -v gemini &> /dev/null; then
        echo -e "  ${GREEN}Gemini CLI:${NC} installed"
        add_detected_cli "gemini"
    fi

    # GitHub Copilot CLI
    if command -v github-copilot &> /dev/null || npm list -g @github/copilot &> /dev/null; then
        # Extract version number cleanly (compatible with all systems)
        local version=$(npm list -g @github/copilot 2>/dev/null | grep '@github/copilot' | sed 's/.*@github\/copilot@\([0-9.]*\).*/\1/' | head -1)
        if [ -n "$version" ]; then
            echo -e "  ${GREEN}GitHub Copilot CLI:${NC} $version"
        else
            echo -e "  ${GREEN}GitHub Copilot CLI:${NC} installed"
        fi
        add_detected_cli "copilot"
    fi

    # OpenAI Codex CLI
    if command -v codex &> /dev/null || npm list -g @openai/codex &> /dev/null; then
        # Extract version number cleanly (compatible with all systems)
        local version=$(npm list -g @openai/codex 2>/dev/null | grep '@openai/codex' | sed 's/.*@openai\/codex@\([0-9.]*\).*/\1/' | head -1)
        if [ -n "$version" ]; then
            echo -e "  ${GREEN}OpenAI Codex CLI:${NC} $version"
        else
            echo -e "  ${GREEN}OpenAI Codex CLI:${NC} installed"
        fi
        add_detected_cli "codex"
    fi

    echo ""
}

# Install Claude CLI
install_claude_cli() {

    print_info "Installing Claude CLI via npm..."
    echo ""

    if ! npm_install_global "@anthropic-ai/claude-code"; then
        return 1
    fi

    if command -v claude &> /dev/null; then
        print_success "Claude CLI installed successfully!"
        echo ""

        # Check authentication
        print_step "Checking authentication..."
        if ! claude auth status &> /dev/null 2>&1; then
            print_warning "API key not configured"
            echo ""

            if ask_yes_no "Do you want to configure authentication now?" "y"; then
                claude auth login || print_warning "Authentication failed - you can configure it later with: claude auth login"
            else
                print_info "You can authenticate later with: claude auth login"
            fi
        else
            print_success "Authentication already configured!"
        fi

        add_detected_cli "claude"
        return 0
    else
        print_error "Installation failed - Claude CLI not found"
        return 1
    fi
}

# Install Gemini CLI
install_gemini_cli() {

    print_info "Installing Gemini CLI via npm..."
    echo ""

    if ! npm_install_global "@google/gemini-cli"; then
        return 1
    fi

    if command -v gemini &> /dev/null; then
        print_success "Gemini CLI installed successfully!"
        echo ""

        # Check authentication
        print_step "Checking authentication..."
        if ! gemini auth status &> /dev/null 2>&1; then
            print_warning "API key not configured"
            echo ""

            if ask_yes_no "Do you want to configure authentication now?" "y"; then
                gemini auth login || print_warning "Authentication failed - you can configure it later with: gemini auth login"
            else
                print_info "You can authenticate later with: gemini auth login"
            fi
        else
            print_success "Authentication already configured!"
        fi

        add_detected_cli "gemini"
        return 0
    else
        print_error "Installation failed - Gemini CLI not found"
        return 1
    fi
}

# Install GitHub Copilot CLI
install_copilot_cli() {

    print_info "Installing GitHub Copilot CLI via npm..."
    echo ""

    if ! npm_install_global "@github/copilot"; then
        return 1
    fi

    # Verify installation
    if npm list -g @github/copilot &> /dev/null; then
        print_success "GitHub Copilot CLI installed successfully!"
        echo ""

        # Create config directory if it doesn't exist
        local copilot_config_dir="$HOME/.copilot"
        if [ ! -d "$copilot_config_dir" ]; then
            print_step "Creating GitHub Copilot configuration directory..."
            mkdir -p "$copilot_config_dir"
            print_success "Configuration directory created at $copilot_config_dir"
        fi

        # Note about authentication
        print_info "GitHub Copilot authentication is handled through GitHub account"
        print_info "You can configure MCP servers in: $copilot_config_dir/mcp-config.json"
        echo ""

        add_detected_cli "copilot"
        return 0
    else
        print_error "Installation failed - GitHub Copilot CLI not found"
        return 1
    fi
}

# Install OpenAI Codex CLI
install_codex_cli() {

    print_info "Installing OpenAI Codex CLI via npm..."
    echo ""

    if ! npm_install_global "@openai/codex"; then
        return 1
    fi

    if command -v codex &> /dev/null; then
        print_success "OpenAI Codex CLI installed successfully!"
        echo ""

        # Check authentication
        print_step "Checking authentication..."
        if ! codex auth status &> /dev/null 2>&1; then
            print_warning "API key not configured"
            echo ""

            if ask_yes_no "Do you want to configure authentication now?" "y"; then
                codex auth login || print_warning "Authentication failed - you can configure it later with: codex auth login"
            else
                print_info "You can authenticate later with: codex auth login"
            fi
        else
            print_success "Authentication already configured!"
        fi

        add_detected_cli "codex"
        return 0
    else
        print_error "Installation failed - OpenAI Codex CLI not found"
        return 1
    fi
}

# Main CLI check and installation flow
check_and_install_ai_clis() {
    detect_ai_clis

    # Count detected CLIs (bash 3.2 compatible)
    local trimmed_clis=$(echo "$DETECTED_CLIS" | xargs)
    local cli_count=$(echo "$trimmed_clis" | wc -w | xargs)

    # If at least one CLI found, proceed
    if [ "$cli_count" -gt 0 ]; then
        print_success "Found $cli_count AI CLI installed: $trimmed_clis"
        echo ""
        print_info "Proceeding with Bob the Fixer installation..."
        echo ""
        return 0
    fi

    # No CLI found - offer installation menu
    print_warning "No AI CLI detected!"
    echo ""
    echo "Bob the Fixer is an MCP server that requires at least one compatible AI CLI."
    echo ""
    echo "Which CLI would you like to install?"
    echo ""
    echo "  1) Claude CLI (recommended)"
    echo "  2) Gemini CLI"
    echo "  3) GitHub Copilot CLI"
    echo "  4) OpenAI Codex CLI"
    echo "  5) All of the above"
    echo "  6) None - I will install manually later"
    echo ""

    printf "Choice [1-6]: "
    read CLI_CHOICE < /dev/tty

    # Handle multiple selections (bash 3.2 compatible)
    case "$CLI_CHOICE" in
        *","*)
            # Multiple choices with commas
            local old_ifs=$IFS
            IFS=','
            for choice in $CLI_CHOICE; do
                IFS=$old_ifs
                choice=$(echo "$choice" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')  # trim whitespace
                case $choice in
                    1) install_claude_cli ;;
                    2) install_gemini_cli ;;
                    3) install_copilot_cli ;;
                    4) install_codex_cli ;;
                esac
            done
            IFS=$old_ifs
            ;;
        *)
            # Single choice
            case $CLI_CHOICE in
            1)
                install_claude_cli
                ;;
            2)
                install_gemini_cli
                ;;
            3)
                install_copilot_cli
                ;;
            4)
                install_codex_cli
                ;;
            5)
                install_claude_cli
                install_gemini_cli
                install_copilot_cli
                install_codex_cli
                ;;
            6)
                echo ""
                print_info "Proceeding without AI CLI installation"
                echo ""
                print_warning "Note: Bob the Fixer MCP server will be compiled but not registered with any AI CLI"
                echo ""
                echo "When you're ready to use Bob the Fixer, install an AI CLI with:"
                if [ "$OS_TYPE" = "linux" ]; then
                    echo "  • Claude:          sudo npm install -g @anthropic-ai/claude-code"
                    echo "  • Gemini:          sudo npm install -g @google/generative-ai-cli"
                    echo "  • GitHub Copilot:  sudo npm install -g @github/copilot"
                    echo "  • OpenAI Codex:    sudo npm install -g @openai/codex"
                else
                    echo "  • Claude:          npm install -g @anthropic-ai/claude-code"
                    echo "  • Gemini:          npm install -g @google/generative-ai-cli"
                    echo "  • GitHub Copilot:  npm install -g @github/copilot"
                    echo "  • OpenAI Codex:    npm install -g @openai/codex"
                fi
                echo ""
                echo "Then manually register Bob the Fixer using:"
                echo "  claude mcp add bob-the-fixer node $SCRIPT_DIR/packages/core/dist/universal-mcp-server.js"
                echo "  codex mcp add bob-the-fixer --env [...] -- node $SCRIPT_DIR/packages/core/dist/universal-mcp-server.js"
                echo "  or configure mcp-config.json for GitHub Copilot in ~/.copilot/"
                echo ""
                # Return success to continue with setup
                return 0
                ;;
            *)
                print_error "Invalid choice!"
                exit 1
                ;;
            esac
            ;;
    esac

    # Re-detect to verify installation (only if we tried to install something)
    if [ "$CLI_CHOICE" != "5" ]; then
        echo ""
        print_step "Verifying installations..."
        detect_ai_clis

        local final_cli_count=$(echo "$DETECTED_CLIS" | wc -w | xargs)
        if [ "$final_cli_count" -eq 0 ]; then
            print_warning "No CLI was installed successfully!"
            echo ""
            print_info "Continuing anyway - you can install an AI CLI later."
            echo ""
        else
            echo ""
            print_success "AI CLIs ready! Proceeding with Bob the Fixer..."
            echo ""
        fi
    fi
}
