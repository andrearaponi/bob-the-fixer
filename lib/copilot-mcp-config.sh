#!/bin/bash

# 🤖 GitHub Copilot MCP Configuration Manager
# Handles mcp-config.json configuration for GitHub Copilot CLI

# Load required libraries
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/colors.sh"
source "$LIB_DIR/prompt-utils.sh"

# GitHub Copilot config directory and file
COPILOT_CONFIG_DIR="$HOME/.copilot"
COPILOT_MCP_CONFIG="$COPILOT_CONFIG_DIR/mcp-config.json"

# Create or update GitHub Copilot MCP configuration
setup_copilot_mcp_config() {
    local project_dir=$1
    local sonar_url=${2:-"http://localhost:9000"}
    local sonar_token=$3
    local encryption_key=$4

    # Create config directory if it doesn't exist
    if [ ! -d "$COPILOT_CONFIG_DIR" ]; then
        mkdir -p "$COPILOT_CONFIG_DIR"
    fi

    # Prepare MCP server entry
    local mcp_server_path="$project_dir/packages/core/dist/universal-mcp-server.js"

    # Create or update mcp-config.json
    if [ ! -f "$COPILOT_MCP_CONFIG" ]; then
        cat > "$COPILOT_MCP_CONFIG" <<EOF
{
  "mcpServers": {
    "bob-the-fixer": {
      "type": "local",
      "command": "node",
      "tools": [
        "*"
      ],
      "args": [
        "$mcp_server_path"
      ],
      "env": {
        "SONAR_URL": "$sonar_url",
        "SONAR_TOKEN": "$sonar_token",
        "LOG_LEVEL": "info",
        "ENCRYPTION_KEY": "$encryption_key",
        "LOG_FILE_PATH": "./logs/mcp-server.log"
      }
    }
  }
}
EOF
    else
        # Check if jq is available for JSON manipulation
        if command -v jq &> /dev/null; then
            # Use jq to merge the configuration
            local temp_config=$(mktemp)

            jq --arg path "$mcp_server_path" \
               --arg url "$sonar_url" \
               --arg token "$sonar_token" \
               --arg key "$encryption_key" \
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
               }' "$COPILOT_MCP_CONFIG" > "$temp_config" 2>/dev/null

            if [ $? -eq 0 ]; then
                mv "$temp_config" "$COPILOT_MCP_CONFIG"
            else
                rm -f "$temp_config"
                print_error "Failed to update mcp-config.json"
                return 1
            fi
        else
            print_warning "jq not found - manual configuration required"
            echo ""
            echo "Please manually add the following to $COPILOT_MCP_CONFIG:"
            echo ""
            cat <<EOF
{
  "mcpServers": {
    "bob-the-fixer": {
      "type": "local",
      "command": "node",
      "tools": ["*"],
      "args": ["$mcp_server_path"],
      "env": {
        "SONAR_URL": "$sonar_url",
        "SONAR_TOKEN": "$sonar_token",
        "LOG_LEVEL": "info",
        "ENCRYPTION_KEY": "$encryption_key",
        "LOG_FILE_PATH": "./logs/mcp-server.log"
      }
    }
  }
}
EOF
            echo ""
            return 1
        fi
    fi

    return 0
}

# Remove Bob the Fixer from GitHub Copilot MCP configuration
remove_copilot_mcp_config() {
    if [ ! -f "$COPILOT_MCP_CONFIG" ]; then
        return 0
    fi

    # Check if jq is available
    if command -v jq &> /dev/null; then
        # Use jq to remove the bob-the-fixer entry
        local temp_config=$(mktemp)
        jq 'del(.mcpServers["bob-the-fixer"])' "$COPILOT_MCP_CONFIG" > "$temp_config" 2>/dev/null
        mv "$temp_config" "$COPILOT_MCP_CONFIG"
    else
        # jq not available, return failure
        return 1
    fi

    return 0
}

# Check if Bob the Fixer is configured in GitHub Copilot
check_copilot_mcp_config() {
    if [ ! -f "$COPILOT_MCP_CONFIG" ]; then
        return 1
    fi

    if command -v jq &> /dev/null; then
        if jq -e '.mcpServers["bob-the-fixer"]' "$COPILOT_MCP_CONFIG" &> /dev/null; then
            return 0
        fi
    else
        # Fallback to grep if jq is not available
        if grep -q "bob-the-fixer" "$COPILOT_MCP_CONFIG" 2>/dev/null; then
            return 0
        fi
    fi

    return 1
}

# Display GitHub Copilot MCP configuration status
show_copilot_mcp_status() {
    echo ""
    print_step "GitHub Copilot MCP Configuration Status:"
    echo ""

    if [ ! -d "$COPILOT_CONFIG_DIR" ]; then
        print_warning "GitHub Copilot config directory not found"
        print_info "Directory: $COPILOT_CONFIG_DIR"
        return 1
    fi

    if [ ! -f "$COPILOT_MCP_CONFIG" ]; then
        print_warning "GitHub Copilot MCP config file not found"
        print_info "Expected: $COPILOT_MCP_CONFIG"
        return 1
    fi

    if check_copilot_mcp_config; then
        print_success "Bob the Fixer is configured in GitHub Copilot"
        print_info "Config file: $COPILOT_MCP_CONFIG"

        # Show configuration details if jq is available
        if command -v jq &> /dev/null; then
            echo ""
            print_info "Configuration details:"
            jq -r '.mcpServers["bob-the-fixer"] |
                   "  Command: \(.command)",
                   "  Script: \(.args[0])",
                   "  SonarQube URL: \(.env.SONAR_URL)"' "$COPILOT_MCP_CONFIG" 2>/dev/null || true
        fi
    else
        print_warning "Bob the Fixer is NOT configured in GitHub Copilot"
        print_info "Config file exists but no bob-the-fixer entry found"
    fi

    echo ""
    return 0
}
