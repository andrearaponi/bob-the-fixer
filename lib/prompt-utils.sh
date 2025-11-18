#!/bin/bash

# 💬 Prompt Utilities
# Interactive prompt functions for user input with validation

# Load colors if not already loaded
if [ -z "$GREEN" ]; then
    LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "$LIB_DIR/colors.sh"
fi

# Standard Y/N prompt with default value
# Usage: ask_yes_no "Question?" [default]
# Returns: 0 for yes, 1 for no
ask_yes_no() {
    local question=$1
    local default=${2:-n}  # default: n

    while true; do
        if [ "$default" = "y" ] || [ "$default" = "Y" ]; then
            echo -ne "${YELLOW}${question}${NC} ${GRAY}[Y/n]${NC}: "
            read answer
            answer=${answer:-y}
        else
            echo -ne "${YELLOW}${question}${NC} ${GRAY}[y/N]${NC}: "
            read answer
            answer=${answer:-n}
        fi

        # Convert to lowercase (bash 3.2 compatible)
        answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
        case $answer in
            y|yes|si|sì)
                return 0
                ;;
            n|no)
                return 1
                ;;
            *)
                print_warning "Please answer y (yes) or n (no)"
                ;;
        esac
    done
}

# Multiple choice prompt
# Usage: ask_choice "Question?" "Option1" "Option2" "Option3"
# Returns: selected option number (1-indexed)
ask_choice() {
    local question=$1
    shift
    local options=("$@")
    local num_options=${#options[@]}

    echo -e "${CYAN}${question}${NC}"
    echo ""

    # bash 3.2 compatible: use traditional for loop with counter
    local i=0
    for option in "${options[@]}"; do
        echo -e "  ${WHITE}$((i+1)))${NC} ${option}"
        i=$((i + 1))
    done
    echo ""

    while true; do
        echo -ne "${YELLOW}Choice${NC} ${GRAY}[1-${num_options}]${NC}: "
        read choice

        if [ "$choice" -ge 1 ] 2>/dev/null && [ "$choice" -le "$num_options" ] 2>/dev/null; then
            return $((choice - 1))
        else
            print_warning "Please enter a number between 1 and ${num_options}"
        fi
    done
}

# Multiple selection prompt (checkboxes simulation)
# Usage: ask_multiple "Question?" "Option1" "Option2" "Option3"
# Returns: space-separated list of selected indices (1-indexed)
ask_multiple() {
    local question=$1
    shift
    local options=("$@")
    local num_options=${#options[@]}

    echo -e "${CYAN}${question}${NC}"
    echo -e "${GRAY}(Enter numbers separated by comma, e.g.: 1,2,4)${NC}"
    echo ""

    # bash 3.2 compatible: use traditional for loop with counter
    local i=0
    for option in "${options[@]}"; do
        echo -e "  ${WHITE}$((i+1)))${NC} ${option}"
        i=$((i + 1))
    done
    echo ""

    while true; do
        echo -ne "${YELLOW}Selection${NC} ${GRAY}[1-${num_options}]${NC}: "
        read selection

        # Remove spaces and split by comma
        selection=$(echo "$selection" | tr -d ' ')

        # bash 3.2 compatible: parse comma-separated values
        local valid=true
        local old_ifs=$IFS
        IFS=','
        for choice in $selection; do
            IFS=$old_ifs
            if [ -z "$choice" ] || [ "$choice" -lt 1 ] 2>/dev/null || [ "$choice" -gt "$num_options" ] 2>/dev/null; then
                valid=false
                break
            fi
        done
        IFS=$old_ifs

        if [ "$valid" = true ]; then
            echo "$selection"
            return 0
        else
            print_warning "Please enter valid numbers between 1 and ${num_options}"
        fi
    done
}

# String input prompt with validation
# Usage: ask_string "Question?" [default] [validator_function]
ask_string() {
    local question=$1
    local default=$2
    local validator=$3

    while true; do
        if [ -n "$default" ]; then
            echo -ne "${YELLOW}${question}${NC} ${GRAY}[${default}]${NC}: "
            read answer
            answer=${answer:-$default}
        else
            echo -ne "${YELLOW}${question}${NC}: "
            read answer
        fi

        # If no validator, accept any non-empty string
        if [ -z "$validator" ]; then
            if [ -n "$answer" ]; then
                echo "$answer"
                return 0
            else
                print_warning "Input cannot be empty"
            fi
        else
            # Call validator function
            if $validator "$answer"; then
                echo "$answer"
                return 0
            fi
        fi
    done
}

# Password input (hidden)
# Usage: ask_password "Question?"
ask_password() {
    local question=$1
    local password

    while true; do
        read -s -p "$(echo -e ${YELLOW}${question}${NC}: )" password
        echo ""

        if [ -n "$password" ]; then
            read -s -p "$(echo -e ${YELLOW}Confirm password${NC}: )" password_confirm
            echo ""

            if [ "$password" = "$password_confirm" ]; then
                echo "$password"
                return 0
            else
                print_warning "Passwords do not match, try again"
            fi
        else
            print_warning "Password cannot be empty"
        fi
    done
}

# Confirmation prompt (requires typing exact confirmation word)
# Usage: confirm_action "Warning message" "confirm_word"
confirm_action() {
    local warning=$1
    local confirm_word=${2:-"CONFIRM"}

    echo -e "${RED}${EMOJI_WARNING} ${warning}${NC}"
    echo ""
    echo -ne "${YELLOW}Type${NC} ${RED}${confirm_word}${NC} ${YELLOW}to confirm${NC}: "
    read confirmation

    if [ "$confirmation" = "$confirm_word" ]; then
        return 0
    else
        print_info "Action cancelled"
        return 1
    fi
}

# Press any key to continue
pause() {
    local message=${1:-"Press ENTER to continue"}
    read -n 1 -s -r -p "$(echo -e ${ORANGE}${message}${NC})"
    echo ""
}

# Timeout prompt (auto-continue after N seconds)
# Usage: ask_yes_no_timeout "Question?" timeout [default]
ask_yes_no_timeout() {
    local question=$1
    local timeout=$2
    local default=${3:-n}

    echo -e "${YELLOW}${question}${NC} ${GRAY}[y/N] (auto: ${default} in ${timeout}s)${NC}"

    if read -t $timeout answer; then
        # Convert to lowercase (bash 3.2 compatible)
        answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
        case $answer in
            y|yes) return 0 ;;
            n|no) return 1 ;;
            *)
                [ "$default" = "y" ] && return 0 || return 1
                ;;
        esac
    else
        echo ""
        print_info "Timeout - using default: $default"
        [ "$default" = "y" ] && return 0 || return 1
    fi
}
