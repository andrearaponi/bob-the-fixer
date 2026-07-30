#!/usr/bin/env bash
# ============================================
# BOB AGENT SKILLS — shared install/remove
# ============================================
#
# Distribution of Bob's agent skills (skills/*) across coding agents, shared by
# install.sh, update.sh and uninstall.sh so the three paths can never drift:
# an update must deliver the same skills a fresh install does.
#
# Requires from the caller: $SCRIPT_DIR (repository root) and the print_* helpers
# from lib/colors.sh.
#
#   claude  -> ~/.claude/skills/ (native Agent Skills, SKILL.md)
#   gemini  -> gemini skills install|uninstall (Agent Skills standard, >= 0.45)
#   codex   -> ~/.codex/prompts/<name>.md (skill body as a custom slash prompt)
#   copilot -> ~/.copilot/skills/ (native Agent Skills, SKILL.md)

# Install Bob's agent skills for every detected coding agent, each through its
# native mechanism. Best-effort: only runs from a checkout (curl-bootstrap mode
# has no skills directory) and never fails the caller.
install_agent_skills() {
    local skills_src="$SCRIPT_DIR/skills"

    if [ ! -d "$skills_src" ]; then
        return 0
    fi

    print_step "Installing Bob agent skills..."

    # Claude Code — native Agent Skills directory
    if command -v claude &> /dev/null; then
        local claude_dst="$HOME/.claude/skills"
        if mkdir -p "$claude_dst" 2>/dev/null && cp -R "$skills_src/." "$claude_dst/" 2>/dev/null; then
            print_success "✓ Claude Code: skills installed in $claude_dst"
        else
            print_warning "Claude Code: could not copy skills — manual: cp -r skills/* ~/.claude/skills/"
        fi
    fi

    # Gemini CLI — Agent Skills standard (same SKILL.md format)
    if command -v gemini &> /dev/null; then
        local gemini_ok=1
        local skill_dir
        for skill_dir in "$skills_src"/*/; do
            # --consent skips the interactive security confirmation (would hang a
            # piped installer); stdin closed as an extra guard for older CLIs.
            gemini skills install "$skill_dir" --consent < /dev/null &> /dev/null || gemini_ok=0
        done
        if [ "$gemini_ok" -eq 1 ]; then
            print_success "✓ Gemini CLI: skills installed (check with: gemini skills list)"
        else
            print_warning "Gemini CLI: skills install failed (needs >= 0.45) — manual: gemini skills install ./skills/<name>"
        fi
    fi

    # GitHub Copilot CLI — native Agent Skills directory (personal skills).
    # The path is documented by the CLI itself (`copilot skill --help`).
    if command -v copilot &> /dev/null; then
        local copilot_dst="$HOME/.copilot/skills"
        if mkdir -p "$copilot_dst" 2>/dev/null && cp -R "$skills_src/." "$copilot_dst/" 2>/dev/null; then
            print_success "✓ Copilot CLI: skills installed in $copilot_dst (check with: copilot skill list)"
        else
            print_warning "Copilot CLI: could not copy skills — manual: cp -r skills/* ~/.copilot/skills/"
        fi
    fi

    # Codex CLI — custom prompts (skill body without YAML frontmatter)
    if command -v codex &> /dev/null; then
        local prompts_dst="$HOME/.codex/prompts"
        if mkdir -p "$prompts_dst" 2>/dev/null; then
            local skill_file skill_name
            for skill_file in "$skills_src"/*/SKILL.md; do
                skill_name="$(basename "$(dirname "$skill_file")")"
                awk 'NR==1 && /^---$/ {fm=1; next} fm==1 {if (/^---$/) fm=2; next} {print}' \
                    "$skill_file" > "$prompts_dst/$skill_name.md" 2>/dev/null || true
            done
            print_success "✓ Codex CLI: prompts installed in $prompts_dst (use /bob-zerodebt)"
        else
            print_warning "Codex CLI: could not write prompts — manual: copy skills/*/SKILL.md bodies to ~/.codex/prompts/"
        fi
    fi

    return 0
}

# Remove Bob's agent skills from every coding agent, the exact counterpart of
# install_agent_skills(). Only the skill names shipped in skills/ are touched —
# anything else living in those directories is left alone.
remove_agent_skills() {
    local skills_src="$SCRIPT_DIR/skills"

    if [ ! -d "$skills_src" ]; then
        return 0
    fi

    print_step "Removing Bob agent skills..."

    local removed=0
    local skill_dir skill_name base

    for skill_dir in "$skills_src"/*/; do
        [ -d "$skill_dir" ] || continue
        skill_name="$(basename "$skill_dir")"

        # Claude Code and Copilot CLI — native Agent Skills directories
        for base in "$HOME/.claude/skills" "$HOME/.copilot/skills"; do
            if [ -d "$base/$skill_name" ]; then
                if rm -rf "$base/$skill_name" 2>/dev/null; then
                    removed=$((removed + 1))
                fi
            fi
        done

        # Codex CLI — custom prompt file
        if [ -f "$HOME/.codex/prompts/$skill_name.md" ]; then
            if rm -f "$HOME/.codex/prompts/$skill_name.md" 2>/dev/null; then
                removed=$((removed + 1))
            fi
        fi

        # Gemini CLI — the CLI owns its skill store; stdin closed so it never hangs
        if command -v gemini &> /dev/null; then
            if gemini skills uninstall "$skill_name" < /dev/null &> /dev/null; then
                removed=$((removed + 1))
            fi
        fi
    done

    if [ "$removed" -gt 0 ]; then
        print_success "✓ Removed $removed agent skill installation(s)"
    else
        print_info "No Bob agent skills found"
    fi
    echo ""
}
