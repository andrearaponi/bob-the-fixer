#!/bin/bash

# 🔌 Port Checker
# Checks for port conflicts and offers resolution options

# Load required libraries
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/colors.sh"
source "$LIB_DIR/prompt-utils.sh"
source "$LIB_DIR/os-detect.sh"

# Required ports for Bob the Fixer (bash 3.2 compatible)
# NOTE: Port 5432 (PostgreSQL) is NOT included because it's only exposed internally
# to the container network, not to the host. It doesn't conflict with host ports.
REQUIRED_PORTS="9000"
REQUIRED_PORTS_DESCRIPTIONS="SonarQube Web UI"

# Alternative ports if main ports are occupied
get_alternative_port() {
    local port=$1
    case $port in
        9000) echo 9001 ;;
        5432) echo 5433 ;;
        *) echo "" ;;
    esac
}

# Get service description for port
get_service_description() {
    local port=$1
    case $port in
        9000) echo "SonarQube Web UI" ;;
        5432) echo "PostgreSQL Database" ;;
        *) echo "Unknown Service" ;;
    esac
}

# Check if port is in use
is_port_in_use() {
    local port=$1

    if [ "$OS_TYPE" = "macos" ]; then
        lsof -i :$port &> /dev/null
    else
        # Linux
        netstat -tuln 2>/dev/null | grep -q ":$port " || \
        ss -tuln 2>/dev/null | grep -q ":$port "
    fi
}

# Get process using port
get_port_process() {
    local port=$1

    if [ "$OS_TYPE" = "macos" ]; then
        lsof -i :$port -t 2>/dev/null | head -1
    else
        # Linux - try multiple methods
        local pid=$(lsof -i :$port -t 2>/dev/null | head -1)
        if [ -z "$pid" ]; then
            pid=$(ss -lptn "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
        fi
        if [ -z "$pid" ]; then
            pid=$(netstat -tlnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | head -1)
        fi
        echo "$pid"
    fi
}

# Get process name from PID
get_process_name() {
    local pid=$1

    if [ -z "$pid" ]; then
        echo "unknown"
        return
    fi

    if [ "$OS_TYPE" = "macos" ]; then
        ps -p $pid -o comm= 2>/dev/null | xargs basename
    else
        ps -p $pid -o comm= 2>/dev/null || cat /proc/$pid/comm 2>/dev/null || echo "unknown"
    fi
}

# Check if process is a protected system process
is_protected_process() {
    local process_name=$1

    # List of protected processes that should NOT be killed
    local protected_processes="gvproxy podman docker dockerd containerd systemd launchd kernel"

    for protected in $protected_processes; do
        if [ "$process_name" = "$protected" ]; then
            return 0  # TRUE - is protected
        fi
    done

    return 1  # FALSE - not protected
}

# Check if PID is a container (by checking if it's managed by docker/podman)
get_container_id() {
    local pid=$1

    # Detect container runtime
    local CONTAINER_CMD=""
    if command -v podman &> /dev/null; then
        CONTAINER_CMD="podman"
    elif command -v docker &> /dev/null; then
        CONTAINER_CMD="docker"
    fi

    if [ -z "$CONTAINER_CMD" ]; then
        echo ""
        return
    fi

    # Check if this PID belongs to a container
    # For running containers, get the container ID
    local container_id=$($CONTAINER_CMD ps --filter "label=com.docker.container.id=$pid" -q 2>/dev/null | head -1)

    if [ -z "$container_id" ]; then
        # Try getting container by checking process mappings
        container_id=$($CONTAINER_CMD ps -q 2>/dev/null | while read cid; do
            if $CONTAINER_CMD exec "$cid" sh -c "test \$$ -eq $pid" 2>/dev/null; then
                echo "$cid"
                break
            fi
        done)
    fi

    echo "$container_id"
}

# Stop container safely using docker/podman commands
stop_container_by_port() {
    local port=$1

    # Detect container runtime
    local CONTAINER_CMD=""
    if command -v podman &> /dev/null; then
        CONTAINER_CMD="podman"
    elif command -v docker &> /dev/null; then
        CONTAINER_CMD="docker"
    fi

    if [ -z "$CONTAINER_CMD" ]; then
        return 1
    fi

    # Find container using this port
    local container_id=$($CONTAINER_CMD ps --filter "publish=$port" -q 2>/dev/null | head -1)

    if [ -z "$container_id" ]; then
        # Try alternative method
        container_id=$($CONTAINER_CMD ps -a 2>/dev/null | grep -i "$port" | awk '{print $1}' | head -1)
    fi

    if [ -n "$container_id" ]; then
        print_warning "Found container: $container_id using port $port"
        print_warning "Stopping container gracefully..."

        if $CONTAINER_CMD stop "$container_id" 2>/dev/null; then
            sleep 1
            print_success "Container stopped successfully"
            return 0
        else
            print_error "Failed to stop container"
            return 1
        fi
    fi

    return 1
}

# Kill process by PID (with safety checks)
kill_process() {
    local pid=$1
    local process_name=$2

    # Check if this is a protected process
    if is_protected_process "$process_name"; then
        print_error "Cannot terminate protected system process: $process_name"
        print_info "This is a critical system component needed by Podman/Docker"
        echo ""
        print_warning "Solutions:"
        echo "  1. Restart your container runtime (Docker Desktop or Podman)"
        echo "  2. Use option 2 to use alternative port instead"
        echo "  3. Run: sudo killall -9 $process_name (DANGEROUS - only if you know what you're doing)"
        return 1
    fi

    print_warning "Attempting to terminate process: $process_name (PID: $pid)"

    if sudo kill -15 $pid 2>/dev/null; then
        sleep 2

        # Check if still running
        if ps -p $pid &> /dev/null; then
            print_warning "Process still active, forcing termination..."
            sudo kill -9 $pid 2>/dev/null
            sleep 1
        fi

        if ! ps -p $pid &> /dev/null; then
            print_success "Process terminated successfully"
            return 0
        else
            print_error "Unable to terminate process"
            return 1
        fi
    else
        print_error "Unable to terminate process (insufficient permissions?)"
        return 1
    fi
}

# Handle single port conflict
handle_port_conflict() {
    local port=$1
    local service=$2
    local pid=$(get_port_process $port)
    local process_name=$(get_process_name $pid)

    echo ""
    print_warning "Port $port ($service) already in use!"
    echo ""
    echo -e "  ${WHITE}Process:${NC}  $process_name"
    echo -e "  ${WHITE}PID:${NC}      $pid"
    echo ""

    echo -e "${CYAN}Options:${NC}"
    echo "  1) Terminate existing process"
    echo "  2) Use alternative port ($(get_alternative_port $port))"
    echo "  3) Skip (configure manually later)"
    echo "  4) Exit installation"
    echo ""

    echo -ne "${YELLOW}Choice [1-4]${NC}: "
    read choice < /dev/tty

    case $choice in
        1)
            # First, try to stop the container if it's using this port
            if stop_container_by_port $port; then
                return 0  # Port now free
            fi

            # If not a container, try killing the process
            if kill_process "$pid" "$process_name"; then
                return 0  # Port now free
            else
                print_error "Unable to free port"
                return 1
            fi
            ;;
        2)
            local alt_port=$(get_alternative_port $port)
            print_info "Using alternative port: $alt_port"
            # Update compose file
            update_compose_port $port $alt_port
            return 0
            ;;
        3)
            print_warning "Port $port skipped - you will need to configure it manually"
            return 2  # Skip
            ;;
        4)
            print_error "Installation cancelled by user"
            exit 1
            ;;
        *)
            print_error "Invalid choice"
            return 1
            ;;
    esac
}

# Update port in podman-compose.yml
update_compose_port() {
    local old_port=$1
    local new_port=$2
    local compose_file="infrastructure/podman-compose.yml"

    if [ ! -f "$compose_file" ]; then
        print_error "Compose file not found: $compose_file"
        return 1
    fi

    print_info "Updating $compose_file..."

    # Backup original file
    cp "$compose_file" "$compose_file.backup.$(date +%Y%m%d_%H%M%S)"

    # Update port mapping (handles formats like "9000:9000" or "- 9000:9000")
    if [ "$OS_TYPE" = "macos" ]; then
        sed -i '' "s/${old_port}:/${new_port}:/g" "$compose_file"
    else
        sed -i "s/${old_port}:/${new_port}:/g" "$compose_file"
    fi

    print_success "Port updated: $old_port → $new_port"

    # Also update environment variable if this is SonarQube port
    if [ "$old_port" = "9000" ]; then
        export SONAR_PORT=$new_port
        print_info "SONAR_URL will be: http://localhost:$new_port"
    fi
}

# Check all required ports
check_all_ports() {
    local ports_ok=true
    local conflicts=()

    # First pass - identify all conflicts
    for port in $REQUIRED_PORTS; do
        local service=$(get_service_description $port)

        print_step "Checking port $port ($service)..."

        if is_port_in_use $port; then
            print_warning "Port $port in use"
            conflicts="$conflicts $port"
            ports_ok=false
        else
            print_success "Port $port - Free"
        fi
    done

    echo ""

    # If no conflicts, we're good
    if [ "$ports_ok" = true ]; then
        print_success "All required ports are available!"
        return 0
    fi

    # Handle conflicts
    local conflict_count=$(echo $conflicts | wc -w)
    print_warning "Found $conflict_count port conflicts"
    echo ""

    for port in $conflicts; do
        local service=$(get_service_description $port)
        handle_port_conflict $port "$service"
    done

    echo ""
    print_success "Port management completed!"
    return 0
}

# Pre-check: verify we have tools to check ports
check_port_tools() {
    local has_tool=false

    if command -v lsof &> /dev/null; then
        has_tool=true
    elif command -v netstat &> /dev/null; then
        has_tool=true
    elif command -v ss &> /dev/null; then
        has_tool=true
    fi

    if [ "$has_tool" = false ]; then
        print_warning "No tool to check ports found (lsof/netstat/ss)"

        if [ "$OS_TYPE" = "linux" ]; then
            if ask_yes_no "Install net-tools?"; then
                $(get_install_command) net-tools lsof
            fi
        fi
    fi
}

# Export environment variables for updated ports
export_port_config() {
    if [ -n "$SONAR_PORT" ]; then
        export SONAR_URL="http://localhost:${SONAR_PORT}"
        echo "export SONAR_URL=\"http://localhost:${SONAR_PORT}\"" >> ~/.bob-installer-env
    fi
}

# Show current port configuration
show_port_config() {
    echo ""
    print_info "Port configuration:"
    echo ""

    for port in $REQUIRED_PORTS; do
        local service=$(get_service_description $port)
        if is_port_in_use $port; then
            echo -e "  ${RED}✗${NC} $port - $service (in use)"
        else
            echo -e "  ${GREEN}✓${NC} $port - $service (free)"
        fi
    done
    echo ""
}
