#!/bin/bash

# 📦 Dependency Checker
# Checks and installs missing dependencies with interactive prompts

# Load required libraries
LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$LIB_DIR/colors.sh"
source "$LIB_DIR/prompt-utils.sh"
source "$LIB_DIR/os-detect.sh"

# Track installation status
DEPENDENCIES_OK=true

# Check if a command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Check Node.js version
check_nodejs() {
    print_step "Checking Node.js..."

    if ! command_exists node; then
        print_warning "Node.js not found!"
        echo ""
        echo "Bob the Fixer requires Node.js >= 18.0.0"
        echo ""

        if ask_yes_no "Do you want to install Node.js?" "y"; then
            install_nodejs
        else
            print_error "Node.js is required to continue"
            DEPENDENCIES_OK=false
            return 1
        fi
    else
        local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -lt 18 ]; then
            print_warning "Node.js version too old: $(node -v)"
            echo "Required version >= 18.0.0"
            echo ""

            if ask_yes_no "Do you want to update Node.js?" "y"; then
                install_nodejs
            else
                print_error "Node.js >= 18.0.0 is required"
                DEPENDENCIES_OK=false
                return 1
            fi
        else
            print_success "Node.js $(node -v) - OK"
        fi
    fi
}

# Install Node.js based on OS
install_nodejs() {
    echo ""
    print_info "Installing Node.js..."

    case "$OS_TYPE" in
        macos)
            if [ "$PACKAGE_MANAGER" = "brew" ]; then
                brew install node@20
            else
                print_error "Homebrew not found. Install manually from: https://nodejs.org"
                return 1
            fi
            ;;
        linux)
            # Use distribution's package manager for Node.js
            if command_exists dnf; then
                # Fedora/RHEL - use official repos
                print_info "Installing Node.js from official Fedora repository..."
                sudo dnf module reset nodejs -y 2>/dev/null || true
                sudo dnf module enable nodejs:20 -y 2>/dev/null || true
                $(get_install_command) nodejs npm
            elif command_exists apt-get; then
                # Ubuntu/Debian - use NodeSource
                print_info "Installing from NodeSource repository..."
                curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                $(get_install_command) nodejs
            else
                print_error "Unsupported package manager"
                print_info "Please install Node.js 18+ manually from: https://nodejs.org"
                return 1
            fi
            ;;
        *)
            print_error "OS not supported for automatic installation"
            print_info "Visit: https://nodejs.org"
            return 1
            ;;
    esac

    if command_exists node; then
        print_success "Node.js $(node -v) installed!"

        # Verify npm is also available
        if ! command_exists npm; then
            print_warning "npm not found after Node.js installation"
            print_info "Installing npm separately..."
            $(get_install_command) npm
        fi
    else
        print_error "Node.js installation failed"
        return 1
    fi
}

# Check npm
check_npm() {
    print_step "Checking npm..."

    if ! command_exists npm; then
        print_warning "npm not found!"
        echo ""
        echo "npm is usually included with Node.js"
        echo ""

        if command_exists node; then
            # Node.js is installed but npm is missing
            print_info "Node.js is installed but npm is missing"

            if ask_yes_no "Do you want to install npm?" "y"; then
                case "$OS_TYPE" in
                    macos)
                        # npm should come with node via brew, try reinstalling
                        brew reinstall node
                        ;;
                    linux)
                        # Install npm package separately
                        $(get_install_command) npm
                        ;;
                esac

                if command_exists npm; then
                    print_success "npm $(npm -v) installed!"
                else
                    print_error "npm installation failed"
                    DEPENDENCIES_OK=false
                    return 1
                fi
            else
                print_error "npm is required to continue"
                DEPENDENCIES_OK=false
                return 1
            fi
        else
            # Neither Node.js nor npm are installed
            if ask_yes_no "Do you want to install Node.js (includes npm)?" "y"; then
                install_nodejs
            else
                print_error "npm is required to continue"
                DEPENDENCIES_OK=false
                return 1
            fi
        fi
    else
        # npm is installed, check version
        local npm_version=$(npm -v | cut -d'.' -f1)
        if [ "$npm_version" -lt 8 ] 2>/dev/null; then
            print_warning "npm version is old: $(npm -v)"
            print_info "Updating npm to latest version..."
            npm install -g npm@latest 2>/dev/null || sudo npm install -g npm@latest
            print_success "npm $(npm -v) - Updated!"
        else
            print_success "npm $(npm -v) - OK"
        fi
    fi
}

# Check git
check_git() {
    print_step "Checking git..."

    if ! command_exists git; then
        print_warning "git not found!"
        echo ""

        if ask_yes_no "Do you want to install git?" "y"; then
            case "$OS_TYPE" in
                macos)
                    brew install git
                    ;;
                linux)
                    $(get_install_command) git
                    ;;
            esac

            if command_exists git; then
                print_success "git installed!"
            else
                print_error "git installation failed"
                DEPENDENCIES_OK=false
                return 1
            fi
        else
            print_error "git is required to continue"
            DEPENDENCIES_OK=false
            return 1
        fi
    else
        print_success "git $(git --version | cut -d' ' -f3) - OK"
    fi
}

# Check container runtime (Podman or Docker)
check_container_runtime() {
    print_step "Checking container runtime..."

    local has_podman=false
    local has_docker=false
    local has_compose=false

    if command_exists podman; then
        has_podman=true
        print_success "Podman $(podman --version | cut -d' ' -f3) - OK"
    fi

    if command_exists docker; then
        has_docker=true
        print_success "Docker $(docker --version | cut -d' ' -f3 | cut -d',' -f1) - OK"
    fi

    if [ "$has_podman" = false ] && [ "$has_docker" = false ]; then
        print_warning "No container runtime found!"
        echo ""
        echo "Bob the Fixer requires Podman or Docker to run SonarQube."
        echo ""
        echo -e "${CYAN}Which do you prefer?${NC}"
        echo "  1) Podman (recommended - rootless, more secure)"
        echo "  2) Docker"
        echo "  3) None (I will install manually)"
        echo ""

        read -p "Choice (1-3): " choice < /dev/tty

        case $choice in
            1)
                install_podman
                ;;
            2)
                install_docker
                ;;
            3)
                print_error "A container runtime is required"
                DEPENDENCIES_OK=false
                return 1
                ;;
            *)
                print_error "Invalid choice"
                DEPENDENCIES_OK=false
                return 1
                ;;
        esac
    fi

    # Check for compose tools
    if [ "$has_podman" = true ]; then
        print_step "Checking podman-compose..."
        if command_exists podman-compose; then
            print_success "podman-compose $(podman-compose --version 2>/dev/null | head -n1 | cut -d' ' -f3 || echo 'installed') - OK"
            has_compose=true
        else
            print_warning "podman-compose not found!"
            echo ""
            echo "podman-compose is required to orchestrate containers."
            echo ""

            if ask_yes_no "Do you want to install podman-compose?" "y"; then
                install_podman_compose
                if command_exists podman-compose; then
                    has_compose=true
                fi
            else
                print_error "podman-compose is required to continue"
                DEPENDENCIES_OK=false
                return 1
            fi
        fi
    elif [ "$has_docker" = true ]; then
        print_step "Checking docker compose..."
        if docker compose version &> /dev/null; then
            print_success "docker compose $(docker compose version --short 2>/dev/null) - OK"
            has_compose=true
        else
            print_warning "docker compose not found!"
            echo ""
            echo "docker compose is required to orchestrate containers."
            echo "Modern Docker includes 'docker compose' by default."
            echo ""
            print_info "Try updating Docker to the latest version"
            DEPENDENCIES_OK=false
            return 1
        fi
    fi
}

# Install Podman
install_podman() {
    echo ""
    print_info "Installing Podman..."

    case "$OS_TYPE" in
        macos)
            brew install podman
            print_info "Initializing Podman machine..."
            podman machine init
            podman machine start
            ;;
        linux)
            # Install podman and podman-compose together when possible
            if [ "$PACKAGE_MANAGER" = "apt" ]; then
                # On Ubuntu/Debian, install both at once
                print_info "Installing podman and podman-compose..."
                $(get_install_command) podman podman-compose
            else
                # On other systems, install podman first
                $(get_install_command) podman
            fi
            ;;
    esac

    if command_exists podman; then
        print_success "Podman installed!"

        # Verify it works
        if podman info &> /dev/null; then
            print_success "Podman working!"
        else
            print_warning "Podman installed but not configured correctly"
            print_info "May require restart or manual configuration"
        fi
    else
        print_error "Podman installation failed"
        DEPENDENCIES_OK=false
        return 1
    fi
}

# Install Docker
install_docker() {
    echo ""
    print_info "Installing Docker..."

    case "$OS_TYPE" in
        macos)
            print_warning "Docker Desktop requires manual installation on macOS"
            print_info "Visit: https://docs.docker.com/desktop/install/mac-install/"
            if ask_yes_no "Have you already installed Docker Desktop?"; then
                if command_exists docker; then
                    print_success "Docker found!"
                else
                    print_error "Docker not found"
                    DEPENDENCIES_OK=false
                    return 1
                fi
            else
                print_error "Docker is required to continue"
                DEPENDENCIES_OK=false
                return 1
            fi
            ;;
        linux)
            # Install Docker using official script
            print_info "Installing Docker via official script..."
            curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
            sudo sh /tmp/get-docker.sh
            rm /tmp/get-docker.sh

            # Add user to docker group
            if ask_yes_no "Add current user to docker group? (recommended)"; then
                sudo usermod -aG docker $USER
                print_success "User added to docker group"
                print_warning "You may need to logout/login to apply changes"
            fi
            ;;
    esac

    if command_exists docker; then
        print_success "Docker installed!"
    else
        print_error "Docker installation failed"
        DEPENDENCIES_OK=false
        return 1
    fi
}

# Install podman-compose
install_podman_compose() {
    echo ""
    print_info "Installing podman-compose..."

    case "$OS_TYPE" in
        macos)
            brew install podman-compose
            ;;
        linux)
            # Try to install from package manager first (faster and more reliable)
            if [ "$PACKAGE_MANAGER" = "apt" ]; then
                # Ubuntu/Debian - podman-compose is available in repos
                print_info "Installing podman-compose from apt..."
                if $(get_install_command) podman-compose; then
                    print_success "podman-compose installed from apt!"
                    return 0
                else
                    print_warning "apt installation failed, trying pip..."
                fi
            elif [ "$PACKAGE_MANAGER" = "dnf" ] || [ "$PACKAGE_MANAGER" = "yum" ]; then
                # Fedora/RHEL - try package manager first
                print_info "Installing podman-compose from $PACKAGE_MANAGER..."
                if $(get_install_command) podman-compose; then
                    print_success "podman-compose installed from $PACKAGE_MANAGER!"
                    return 0
                else
                    print_warning "$PACKAGE_MANAGER installation failed, trying pip..."
                fi
            fi

            # Fallback to pip installation
            print_info "Installing podman-compose via pip..."
            if command_exists pip3; then
                pip3 install --user podman-compose
                # Add ~/.local/bin to PATH if not already there
                if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
                    export PATH="$HOME/.local/bin:$PATH"
                    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
                    print_info "Added ~/.local/bin to PATH"
                fi
            elif command_exists pip; then
                pip install --user podman-compose
                if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
                    export PATH="$HOME/.local/bin:$PATH"
                    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
                    print_info "Added ~/.local/bin to PATH"
                fi
            else
                # Install pip first
                print_info "Installing python3-pip for podman-compose..."
                $(get_install_command) python3-pip
                if command_exists pip3; then
                    pip3 install --user podman-compose
                    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
                        export PATH="$HOME/.local/bin:$PATH"
                        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
                        print_info "Added ~/.local/bin to PATH"
                    fi
                else
                    print_error "Failed to install pip - cannot install podman-compose"
                    return 1
                fi
            fi
            ;;
    esac

    if command_exists podman-compose; then
        print_success "podman-compose installed!"
    else
        print_error "podman-compose installation failed"
        DEPENDENCIES_OK=false
        return 1
    fi
}

# Check jq (JSON processor)
check_jq() {
    print_step "Checking jq..."

    if ! command_exists jq; then
        print_warning "jq not found!"
        echo "jq is used to process JSON (token generation)"
        echo ""

        if ask_yes_no "Do you want to install jq?" "y"; then
            case "$OS_TYPE" in
                macos)
                    brew install jq
                    ;;
                linux)
                    $(get_install_command) jq
                    ;;
            esac

            if command_exists jq; then
                print_success "jq installed!"
            else
                print_error "jq installation failed"
                DEPENDENCIES_OK=false
                return 1
            fi
        else
            print_error "jq is required to continue"
            DEPENDENCIES_OK=false
            return 1
        fi
    else
        print_success "jq $(jq --version | cut -d'-' -f2) - OK"
    fi
}

# Check curl
check_curl() {
    print_step "Checking curl..."

    if ! command_exists curl; then
        print_warning "curl not found!"

        if ask_yes_no "Do you want to install curl?" "y"; then
            case "$OS_TYPE" in
                macos)
                    brew install curl
                    ;;
                linux)
                    $(get_install_command) curl
                    ;;
            esac

            if command_exists curl; then
                print_success "curl installed!"
            else
                print_error "curl installation failed"
                DEPENDENCIES_OK=false
                return 1
            fi
        else
            print_error "curl is required to continue"
            DEPENDENCIES_OK=false
            return 1
        fi
    else
        print_success "curl - OK"
    fi
}

# Check openssl
check_openssl() {
    print_step "Checking openssl..."

    if ! command_exists openssl; then
        print_warning "openssl not found!"

        if ask_yes_no "Do you want to install openssl?" "y"; then
            case "$OS_TYPE" in
                macos)
                    brew install openssl
                    ;;
                linux)
                    $(get_install_command) openssl
                    ;;
            esac

            if command_exists openssl; then
                print_success "openssl installed!"
            else
                print_error "openssl installation failed"
                DEPENDENCIES_OK=false
                return 1
            fi
        else
            print_error "openssl is required to continue"
            DEPENDENCIES_OK=false
            return 1
        fi
    else
        print_success "openssl - OK"
    fi
}

# Check Java (required for sonar-scanner)
check_java() {
    print_step "Checking Java (for sonar-scanner)..."

    if ! command_exists java; then
        print_warning "Java not found!"
        echo ""
        echo "Java 17+ is required to run sonar-scanner locally."
        echo ""

        if ask_yes_no "Do you want to install Java?" "y"; then
            case "$OS_TYPE" in
                macos)
                    brew install openjdk@17
                    # Link it
                    sudo ln -sfn $(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk 2>/dev/null || true
                    ;;
                linux)
                    # Install OpenJDK 17
                    if command_exists dnf; then
                        $(get_install_command) java-17-openjdk java-17-openjdk-devel
                    elif command_exists apt-get; then
                        $(get_install_command) openjdk-17-jdk
                    else
                        print_error "Unsupported package manager"
                        return 1
                    fi
                    ;;
            esac

            if command_exists java; then
                print_success "Java installed!"
            else
                print_warning "Java installation failed (not critical for Bob the Fixer)"
                return 1
            fi
        else
            print_warning "Java not installed - sonar-scanner won't work locally"
            return 1
        fi
    else
        local java_version=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
        if [ "$java_version" -ge 17 ] 2>/dev/null; then
            print_success "Java $(java -version 2>&1 | head -n 1 | cut -d'"' -f2) - OK"
        else
            print_warning "Java version too old: $(java -version 2>&1 | head -n 1 | cut -d'"' -f2)"
            print_info "Java 17+ is required for sonar-scanner"
            echo ""

            if ask_yes_no "Do you want to install Java 17?" "y"; then
                case "$OS_TYPE" in
                    macos)
                        brew install openjdk@17
                        # Link it
                        sudo ln -sfn $(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk 2>/dev/null || true
                        ;;
                    linux)
                        # Install OpenJDK 17
                        if command_exists dnf; then
                            $(get_install_command) java-17-openjdk java-17-openjdk-devel
                        elif command_exists apt-get; then
                            $(get_install_command) openjdk-17-jdk
                        else
                            print_error "Unsupported package manager"
                            return 1
                        fi
                        ;;
                esac

                if command_exists java; then
                    local new_version=$(java -version 2>&1 | head -n 1 | cut -d'"' -f2 | cut -d'.' -f1)
                    if [ "$new_version" -ge 17 ] 2>/dev/null; then
                        print_success "Java 17 installed!"
                    else
                        print_warning "Java installed but version may not be 17+"
                        print_info "You may need to update JAVA_HOME or PATH"
                    fi
                else
                    print_warning "Java installation failed (not critical for Bob the Fixer)"
                fi
            else
                print_warning "Java not upgraded - sonar-scanner may not work correctly"
            fi
        fi
    fi
}

# Check tree (required for project structure visualization in sonar_generate_config)
check_tree() {
    print_step "Checking tree..."

    if ! command_exists tree; then
        print_warning "tree not found!"
        echo ""
        echo "tree is required for project structure visualization."
        echo ""

        if ask_yes_no "Do you want to install tree?" "y"; then
            case "$OS_TYPE" in
                macos)
                    brew install tree
                    ;;
                linux)
                    $(get_install_command) tree
                    ;;
            esac

            if command_exists tree; then
                print_success "tree installed!"
            else
                print_error "tree installation failed"
                DEPENDENCIES_OK=false
                return 1
            fi
        else
            print_error "tree is required to continue"
            DEPENDENCIES_OK=false
            return 1
        fi
    else
        print_success "tree - OK"
    fi
}

# Check sonar-scanner (optional)
check_sonar_scanner() {
    print_step "Checking sonar-scanner (optional)..."

    if ! command_exists sonar-scanner; then
        print_warning "sonar-scanner not found"
        echo ""
        echo "sonar-scanner is optional but recommended for local analysis."
        echo ""

        if ask_yes_no "Do you want to install sonar-scanner?" "n"; then
            # Check if Java is available first
            if ! command_exists java; then
                print_warning "Java is required for sonar-scanner"
                if ! check_java; then
                    print_warning "Skipping sonar-scanner installation (Java not available)"
                    return 0
                fi
            fi
            case "$OS_TYPE" in
                macos)
                    brew install sonar-scanner
                    ;;
                linux)
                    print_info "Installing sonar-scanner on Linux..."
                    local SCANNER_VERSION="5.0.1.3006"
                    local SCANNER_URL="https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SCANNER_VERSION}-linux.zip"

                    print_info "Downloading sonar-scanner..."
                    curl -o /tmp/sonar-scanner.zip -L "$SCANNER_URL"

                    print_info "Extracting..."
                    sudo unzip -q /tmp/sonar-scanner.zip -d /opt/
                    sudo ln -sf /opt/sonar-scanner-${SCANNER_VERSION}-linux/bin/sonar-scanner /usr/local/bin/sonar-scanner

                    rm /tmp/sonar-scanner.zip
                    ;;
            esac

            if command_exists sonar-scanner; then
                print_success "sonar-scanner installed!"
            else
                print_warning "sonar-scanner installation failed (not critical)"
            fi
        else
            print_info "Skipped sonar-scanner (you can install it later)"
        fi
    else
        print_success "sonar-scanner - OK"
    fi
}

# Main function to check all dependencies
check_all_dependencies() {
    check_nodejs
    check_npm
    check_git
    check_container_runtime
    check_jq
    check_curl
    check_openssl
    check_tree

    # Java and sonar-scanner are optional
    check_java || true  # Don't fail if Java is not installed
    check_sonar_scanner || true  # Don't fail if sonar-scanner is not installed

    echo ""

    if [ "$DEPENDENCIES_OK" = true ]; then
        print_success "All essential dependencies are installed!"
        return 0
    else
        print_error "Some essential dependencies are missing"
        print_info "Install missing dependencies and re-run the script"
        return 1
    fi
}
