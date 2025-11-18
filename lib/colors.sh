#!/bin/bash

# 🎨 Colors and Formatting Utilities
# Provides consistent color scheme across all Bob the Fixer scripts

# Color definitions
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export ORANGE='\033[38;5;208m'  # True orange color
export BLUE='\033[0;34m'
export RED='\033[0;31m'
export CYAN='\033[0;36m'
export MAGENTA='\033[0;35m'
export WHITE='\033[1;37m'
export GRAY='\033[0;90m'
export NC='\033[0m' # No Color

# Emoji definitions (for better UX)
export EMOJI_ROCKET="🚀"
export EMOJI_CHECK="✅"
export EMOJI_WARNING="⚠️"
export EMOJI_ERROR="❌"
export EMOJI_INFO="ℹ️"
export EMOJI_SEARCH="🔍"
export EMOJI_PACKAGE="📦"
export EMOJI_WRENCH="🔧"
export EMOJI_ROBOT="🤖"
export EMOJI_FIRE="🔥"
export EMOJI_SPARKLES="✨"
export EMOJI_HOURGLASS="⏳"
export EMOJI_KEY="🔑"
export EMOJI_PARTY="🎉"
export EMOJI_SCROLL="📋"
export EMOJI_GLOBE="🌍"
export EMOJI_CLEAN="🧹"
export EMOJI_TEST="🧪"
export EMOJI_DOCKER="🐳"
export EMOJI_FOLDER="📁"
export EMOJI_STOP="🛑"
export EMOJI_PLUG="🔌"

# Print functions with colors
print_success() {
    echo -e "${GREEN}$1${NC}"
}

print_error() {
    echo -e "${RED}${EMOJI_ERROR} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}${EMOJI_WARNING} $1${NC}"
}

print_info() {
    echo -e "${BLUE}$1${NC}"
}

print_step() {
    echo -e "${CYAN}$1${NC}"
}

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_banner() {
    clear
    echo -e "${CYAN}"
    cat << "EOF"
    ____        __       __  __            ______
   / __ )____  / /_     / /_/ /_  ___     / ____(_)  _____  _____
  / __  / __ \/ __ \   / __/ __ \/ _ \   / /_  / / |/_/ _ \/ ___/
 / /_/ / /_/ / /_/ /  / /_/ / / /  __/  / __/ / />  </  __/ /
/_____/\____/_.___/   \__/_/ /_/\___/  /_/   /_/_/|_|\___/_/

EOF
    echo -e "${NC}"
    echo -e "${WHITE}ONE COMMAND INSTALL - Universal Setup Script${NC}"
    echo -e "${GRAY}Version 0.1.0 - Intelligent dependency management${NC}"
    echo ""
}

# Progress bar
show_progress() {
    local current=$1
    local total=$2
    local task=$3
    local percent=$((current * 100 / total))
    local completed=$((percent / 2))
    local remaining=$((50 - completed))

    printf "\r${CYAN}["
    printf "%${completed}s" | tr ' ' '='
    printf "%${remaining}s" | tr ' ' ' '
    printf "] ${percent}%% - ${task}${NC}"

    if [ $current -eq $total ]; then
        echo ""
    fi
}

# Spinner for long-running tasks
show_spinner() {
    local pid=$1
    local message=$2
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0

    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) %10 ))
        printf "\r${CYAN}${spin:$i:1} ${message}...${NC}"
        sleep 0.1
    done

    printf "\r${GREEN}${message}... Done!${NC}\n"
}
