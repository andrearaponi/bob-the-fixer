#!/bin/bash

# 🔍 OS Detection and System Information
# Detects operating system, distribution, package manager, and architecture

# Load colors if not already loaded
if [ -z "$GREEN" ]; then
    LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "$LIB_DIR/colors.sh"
fi

# Global variables (exported for use in other scripts)
export OS_TYPE=""           # macos, linux
export OS_DISTRO=""         # ubuntu, debian, fedora, rhel, centos, arch, etc.
export OS_VERSION=""        # OS version number
export OS_ARCH=""           # x86_64, arm64, etc.
export PACKAGE_MANAGER=""   # apt, dnf, yum, pacman, brew
export INIT_SYSTEM=""       # systemd, launchd, init
export SHELL_TYPE=""        # bash, zsh, fish

# Detect OS type
detect_os_type() {
    case "$(uname -s)" in
        Darwin*)
            OS_TYPE="macos"
            ;;
        Linux*)
            OS_TYPE="linux"
            ;;
        *)
            OS_TYPE="unknown"
            ;;
    esac
}

# Detect Linux distribution
detect_linux_distro() {
    if [ "$OS_TYPE" != "linux" ]; then
        return
    fi

    # Try /etc/os-release (most common)
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS_DISTRO=${ID}
        OS_VERSION=${VERSION_ID}

    # Fallback methods
    elif [ -f /etc/redhat-release ]; then
        OS_DISTRO="rhel"
    elif [ -f /etc/debian_version ]; then
        OS_DISTRO="debian"
    else
        OS_DISTRO="unknown"
    fi
}

# Detect macOS version
detect_macos_version() {
    if [ "$OS_TYPE" != "macos" ]; then
        return
    fi

    OS_VERSION=$(sw_vers -productVersion)
}

# Detect system architecture
detect_architecture() {
    OS_ARCH=$(uname -m)

    # Normalize architecture names
    case "$OS_ARCH" in
        x86_64|amd64)
            OS_ARCH="x86_64"
            ;;
        aarch64|arm64)
            OS_ARCH="arm64"
            ;;
    esac
}

# Detect package manager
detect_package_manager() {
    if [ "$OS_TYPE" = "macos" ]; then
        if command -v brew &> /dev/null; then
            PACKAGE_MANAGER="brew"
        else
            PACKAGE_MANAGER="none"
        fi
    elif [ "$OS_TYPE" = "linux" ]; then
        if command -v apt-get &> /dev/null; then
            PACKAGE_MANAGER="apt"
        elif command -v dnf &> /dev/null; then
            PACKAGE_MANAGER="dnf"
        elif command -v yum &> /dev/null; then
            PACKAGE_MANAGER="yum"
        elif command -v pacman &> /dev/null; then
            PACKAGE_MANAGER="pacman"
        elif command -v zypper &> /dev/null; then
            PACKAGE_MANAGER="zypper"
        else
            PACKAGE_MANAGER="none"
        fi
    fi
}

# Detect init system
detect_init_system() {
    if [ "$OS_TYPE" = "macos" ]; then
        INIT_SYSTEM="launchd"
    elif [ "$OS_TYPE" = "linux" ]; then
        if command -v systemctl &> /dev/null; then
            INIT_SYSTEM="systemd"
        else
            INIT_SYSTEM="init"
        fi
    fi
}

# Detect shell type
detect_shell_type() {
    SHELL_TYPE=$(basename "$SHELL")
}

# Check if running with sudo/root
is_root() {
    [ "$(id -u)" -eq 0 ]
}

# Check if sudo is available
has_sudo() {
    command -v sudo &> /dev/null && sudo -n true 2>/dev/null
}

# Check if running in WSL (Windows Subsystem for Linux)
is_wsl() {
    [ -f /proc/version ] && grep -qi microsoft /proc/version
}

# Get total system memory in GB
get_total_memory() {
    if [ "$OS_TYPE" = "macos" ]; then
        echo $(($(sysctl -n hw.memsize) / 1024 / 1024 / 1024))
    elif [ "$OS_TYPE" = "linux" ]; then
        echo $(($(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 / 1024))
    fi
}

# Get number of CPU cores
get_cpu_cores() {
    if [ "$OS_TYPE" = "macos" ]; then
        sysctl -n hw.ncpu
    elif [ "$OS_TYPE" = "linux" ]; then
        nproc
    fi
}

# Main detection function
detect_system() {
    detect_os_type
    detect_architecture
    detect_package_manager
    detect_init_system
    detect_shell_type

    if [ "$OS_TYPE" = "linux" ]; then
        detect_linux_distro
    elif [ "$OS_TYPE" = "macos" ]; then
        detect_macos_version
    fi
}

# Print system information
print_system_info() {
    echo -e "  ${WHITE}OS:${NC}              ${OS_TYPE}"

    if [ "$OS_TYPE" = "linux" ]; then
        echo -e "  ${WHITE}Distribution:${NC}    ${OS_DISTRO} ${OS_VERSION}"
    elif [ "$OS_TYPE" = "macos" ]; then
        echo -e "  ${WHITE}Version:${NC}         ${OS_VERSION}"
    fi

    echo -e "  ${WHITE}Architecture:${NC}    ${OS_ARCH}"
    echo -e "  ${WHITE}Package Manager:${NC} ${PACKAGE_MANAGER}"
    echo -e "  ${WHITE}Init System:${NC}     ${INIT_SYSTEM}"
    echo -e "  ${WHITE}Shell:${NC}           ${SHELL_TYPE}"
    echo -e "  ${WHITE}Memory:${NC}          $(get_total_memory) GB"
    echo -e "  ${WHITE}CPU Cores:${NC}       $(get_cpu_cores)"

    if is_wsl; then
        echo -e "  ${WHITE}WSL:${NC}             ${GREEN}Yes${NC}"
    fi

    if is_root; then
        echo -e "  ${WHITE}Running as:${NC}      ${RED}root${NC}"
    elif has_sudo; then
        echo -e "  ${WHITE}Sudo:${NC}            ${GREEN}Available${NC}"
    else
        echo -e "  ${WHITE}Sudo:${NC}            ${YELLOW}Not Available${NC}"
    fi

    echo ""
}

# Get install command for package manager
get_install_command() {
    case "$PACKAGE_MANAGER" in
        apt)
            echo "sudo apt-get install -y"
            ;;
        dnf)
            echo "sudo dnf install -y"
            ;;
        yum)
            echo "sudo yum install -y"
            ;;
        pacman)
            echo "sudo pacman -S --noconfirm"
            ;;
        zypper)
            echo "sudo zypper install -y"
            ;;
        brew)
            echo "brew install"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Get update command for package manager
get_update_command() {
    case "$PACKAGE_MANAGER" in
        apt)
            echo "sudo apt-get update"
            ;;
        dnf)
            echo "sudo dnf check-update"
            ;;
        yum)
            echo "sudo yum check-update"
            ;;
        pacman)
            echo "sudo pacman -Sy"
            ;;
        zypper)
            echo "sudo zypper refresh"
            ;;
        brew)
            echo "brew update"
            ;;
        *)
            echo ""
            ;;
    esac
}

# Auto-run detection on source
detect_system
