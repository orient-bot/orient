#!/usr/bin/env bash
set -euo pipefail

# Worktree Manager
# Manages worktrees for AI coding agents (Cursor, Claude Code, etc.) with auto-setup and cleanup

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_MAX_AGE_DAYS=7
WORKTREE_BASE="$HOME/ai-worktrees"

# Get the repository root (works from anywhere in the repo)
get_repo_root() {
    git rev-parse --show-toplevel 2>/dev/null
}

# Get the project name from the repo directory
get_project_name() {
    local repo_root="$1"
    basename "$repo_root"
}

# Print colored message
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Cleanup stale worktrees
cleanup_stale_worktrees() {
    local max_age_days="${1:-$DEFAULT_MAX_AGE_DAYS}"
    local repo_root
    local project_name

    repo_root=$(get_repo_root)
    if [[ -z "$repo_root" ]]; then
        log_error "Not in a git repository"
        return 1
    fi

    project_name=$(get_project_name "$repo_root")
    local project_worktree_base="$WORKTREE_BASE/$project_name"

    if [[ ! -d "$project_worktree_base" ]]; then
        log_info "No worktrees directory found at $project_worktree_base"
        return 0
    fi

    log_info "Cleaning up worktrees older than $max_age_days days in $project_worktree_base..."

    local now
    now=$(date +%s)
    local max_age_seconds=$((max_age_days * 86400))
    local cleaned=0

    # List all worktrees for this project
    while IFS= read -r worktree_path; do
        if [[ ! -d "$worktree_path" ]]; then
            continue
        fi

        # Get modification time (macOS: stat -f %m, Linux: stat -c %Y)
        local mtime
        if [[ "$OSTYPE" == "darwin"* ]]; then
            mtime=$(stat -f %m "$worktree_path" 2>/dev/null || echo "0")
        else
            mtime=$(stat -c %Y "$worktree_path" 2>/dev/null || echo "0")
        fi

        local age=$((now - mtime))

        if [[ $age -gt $max_age_seconds ]]; then
            log_warn "Removing stale worktree: $worktree_path ($(( age / 86400 )) days old)"

            # Get the branch name from the worktree
            local branch
            branch=$(cd "$worktree_path" && git branch --show-current 2>/dev/null || echo "")

            # Remove the worktree
            git -C "$repo_root" worktree remove "$worktree_path" --force 2>/dev/null || {
                log_warn "Failed to remove worktree with git, removing directory manually"
                rm -rf "$worktree_path"
            }

            # Try to delete the local branch
            if [[ -n "$branch" ]]; then
                git -C "$repo_root" branch -D "$branch" 2>/dev/null || true
            fi

            ((cleaned++))
        fi
    done < <(find "$project_worktree_base" -mindepth 1 -maxdepth 1 -type d)

    if [[ $cleaned -eq 0 ]]; then
        log_success "No stale worktrees found"
    else
        log_success "Cleaned up $cleaned stale worktree(s)"
    fi

    return 0
}

# Create a new worktree
create_worktree() {
    local name="$1"
    local isolated="${2:-false}"
    local repo_root
    local project_name

    repo_root=$(get_repo_root)
    if [[ -z "$repo_root" ]]; then
        log_error "Not in a git repository"
        return 1
    fi

    project_name=$(get_project_name "$repo_root")

    # First, cleanup stale worktrees
    log_info "Running cleanup before creating new worktree..."
    cleanup_stale_worktrees "$DEFAULT_MAX_AGE_DAYS" || true

    # Generate unique branch and directory names
    local timestamp
    timestamp=$(date +%s)
    local sanitized_name
    sanitized_name=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

    local branch_name="worktree/${sanitized_name}-${timestamp}"
    local worktree_dir="${sanitized_name}-${timestamp}"
    local project_worktree_base="$WORKTREE_BASE/$project_name"
    local worktree_path="$project_worktree_base/$worktree_dir"

    # Create project worktree base directory
    mkdir -p "$project_worktree_base"

    # Fetch latest from remote
    log_info "Fetching latest changes from remote..."
    git -C "$repo_root" fetch origin

    # Get the main branch name (could be 'main' or 'master')
    local main_branch
    main_branch=$(git -C "$repo_root" symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

    # Create the worktree
    log_info "Creating worktree: $worktree_path"
    log_info "Branch: $branch_name"

    if ! git -C "$repo_root" worktree add -b "$branch_name" "$worktree_path" "origin/$main_branch"; then
        log_error "Failed to create worktree"
        return 1
    fi

    # Copy configuration files
    log_info "Copying configuration files..."

    # Copy .env file if it exists
    if [[ -f "$repo_root/.env" ]]; then
        cp "$repo_root/.env" "$worktree_path/.env"
        log_success ".env copied"
    else
        log_warn "No .env file found in main repo"
    fi

    # Copy Claude/AI agent local settings if it exists
    if [[ -f "$repo_root/.claude/settings.local.json" ]]; then
        mkdir -p "$worktree_path/.claude"
        cp "$repo_root/.claude/settings.local.json" "$worktree_path/.claude/settings.local.json"
        log_success ".claude/settings.local.json copied"
    fi

    # Note: MCP settings (.cursor/mcp.json, .mcp.json) are NOT copied
    # Cursor inherits MCP configuration from the main app automatically

    # Start pnpm install in background
    log_info "Starting pnpm install in background..."
    log_info "Installation log: $worktree_path/.pnpm-install.log"

    (
        cd "$worktree_path"
        nohup pnpm install > .pnpm-install.log 2>&1 &
        echo $! > .pnpm-install.pid
    )

    # If isolated mode, seed the database after pnpm install
    if [[ "$isolated" == "true" ]]; then
        log_info "Isolated mode: database will be seeded after pnpm install completes"
        log_info "Database log: $worktree_path/.db-seed.log"

        # Start seeding in background (waits for pnpm install to complete)
        (
            cd "$worktree_path"
            # Wait for pnpm install to complete
            while [[ -f .pnpm-install.pid ]] && kill -0 "$(cat .pnpm-install.pid)" 2>/dev/null; do
                sleep 2
            done
            # Run database seeding with isolated flag
            nohup bash -c "ISOLATED=true ./scripts/seed-worktree-db.sh" > .db-seed.log 2>&1 &
        ) &
    fi

    log_success "Worktree created successfully!"
    log_success "Path: $worktree_path"
    log_info "pnpm install is running in the background"
    log_info "Check progress: tail -f $worktree_path/.pnpm-install.log"

    if [[ "$isolated" == "true" ]]; then
        log_info "Database seeding will start after pnpm install completes"
        log_info "Check progress: tail -f $worktree_path/.db-seed.log"
    fi

    echo ""
    echo "$worktree_path"

    return 0
}

# List all worktrees for the current project
list_worktrees() {
    local repo_root
    local project_name

    repo_root=$(get_repo_root)
    if [[ -z "$repo_root" ]]; then
        log_error "Not in a git repository"
        return 1
    fi

    project_name=$(get_project_name "$repo_root")
    local project_worktree_base="$WORKTREE_BASE/$project_name"

    log_info "Worktrees for project: $project_name"
    echo ""

    if [[ ! -d "$project_worktree_base" ]]; then
        log_warn "No worktrees directory found"
        return 0
    fi

    # Get all git worktrees
    local found=0
    while IFS= read -r line; do
        if [[ $line == worktree* ]]; then
            local path="${line#worktree }"
            if [[ "$path" == "$project_worktree_base"* ]]; then
                found=1
                echo -e "${GREEN}●${NC} $path"
            fi
        elif [[ $line == branch* ]] && [[ $found -eq 1 ]]; then
            local branch="${line#branch refs/heads/}"
            echo "  └─ Branch: $branch"
            found=0
        fi
    done < <(git -C "$repo_root" worktree list --porcelain)

    return 0
}

# Show usage
usage() {
    cat <<EOF
Worktree Manager

Automated worktree management for AI coding agents (Cursor, Claude Code, etc.).

Usage:
    $0 create <name> [--isolated]  Create a new worktree with auto-setup
    $0 list                        List all worktrees for the current project
    $0 cleanup [--days N]          Cleanup worktrees older than N days (default: 7)
    $0 help                        Show this help message

Options:
    --isolated    Create a dedicated database for this worktree and seed it with test data.
                  Use this for schema changes, migration testing, or isolated experiments.

Examples:
    $0 create staging-env              # Uses shared dev database
    $0 create dark-mode-feature        # Uses shared dev database
    $0 create schema-changes --isolated # Creates dedicated database with seeding
    $0 list
    $0 cleanup
    $0 cleanup --days 14

Copied files:
    .env                          Environment variables
    .claude/settings.local.json   AI agent settings

Note: MCP settings are inherited from main app (not copied)

EOF
}

# Main command dispatcher
main() {
    local command="${1:-help}"

    case "$command" in
        create)
            if [[ $# -lt 2 ]]; then
                log_error "Missing worktree name"
                echo ""
                usage
                exit 1
            fi
            local name="$2"
            local isolated="false"
            # Check for --isolated flag
            if [[ $# -ge 3 ]] && [[ "$3" == "--isolated" ]]; then
                isolated="true"
            fi
            create_worktree "$name" "$isolated"
            ;;
        list)
            list_worktrees
            ;;
        cleanup)
            local days="$DEFAULT_MAX_AGE_DAYS"
            if [[ $# -ge 2 ]] && [[ "$2" == "--days" ]] && [[ $# -ge 3 ]]; then
                days="$3"
            fi
            cleanup_stale_worktrees "$days"
            ;;
        help|--help|-h)
            usage
            ;;
        *)
            log_error "Unknown command: $command"
            echo ""
            usage
            exit 1
            ;;
    esac
}

# Run main if executed directly (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
