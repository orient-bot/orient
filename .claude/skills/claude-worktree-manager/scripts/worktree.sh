#!/usr/bin/env bash
set -euo pipefail

# Claude Worktree Manager
# Manages worktrees for Claude Code development sessions with auto-setup and cleanup

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEFAULT_MAX_AGE_DAYS=7
WORKTREE_BASE="$HOME/claude-worktrees"

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

# Set model in settings.local.json using sed (fallback method)
set_model_with_sed() {
    local settings_file="$1"
    local model="$2"

    # Try to update existing model key
    if grep -q "\"model\"" "$settings_file"; then
        # Model key exists, update its value
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/\"model\": \"[^\"]*\"/\"model\": \"$model\"/g" "$settings_file"
        else
            sed -i "s/\"model\": \"[^\"]*\"/\"model\": \"$model\"/g" "$settings_file"
        fi
        return 0
    else
        # Model key doesn't exist, add it after the first opening brace
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "1s/{/{\"model\": \"$model\",/" "$settings_file"
        else
            sed -i "1s/{/{\"model\": \"$model\",/" "$settings_file"
        fi
        return 0
    fi
}

# Verify that the model was correctly set in settings.local.json
verify_model_setting() {
    local settings_file="$1"
    local expected_model="$2"

    if [[ ! -f "$settings_file" ]]; then
        return 1
    fi

    # Try to extract model value using jq first
    if command -v jq &> /dev/null; then
        local model_value
        model_value=$(jq -r '.model // empty' "$settings_file" 2>/dev/null)
        if [[ "$model_value" == "$expected_model" ]]; then
            return 0
        fi
    fi

    # Fallback to grep
    if grep -q "\"model\": \"$expected_model\"" "$settings_file"; then
        return 0
    fi

    return 1
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
    local model="${3:-}"
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

    # Check if a branch with the sanitized name already exists on origin
    local checkout_ref="origin/$main_branch"
    if git -C "$repo_root" rev-parse "origin/$sanitized_name" >/dev/null 2>&1; then
        log_info "Found existing branch on origin: $sanitized_name"
        log_info "Pulling latest changes from origin/$sanitized_name..."
        checkout_ref="origin/$sanitized_name"
        # Create local branch tracking the remote one
        git -C "$repo_root" branch -D "$sanitized_name" 2>/dev/null || true
        git -C "$repo_root" branch -t "$sanitized_name" "origin/$sanitized_name"
        branch_name="$sanitized_name"
    else
        log_info "No existing branch found on origin, creating new branch from $main_branch"
        checkout_ref="origin/$main_branch"
    fi

    # Create the worktree
    log_info "Creating worktree: $worktree_path"
    log_info "Branch: $branch_name"

    if ! git -C "$repo_root" worktree add "$worktree_path" "$checkout_ref"; then
        log_error "Failed to create worktree"
        return 1
    fi

    # Copy .env file if it exists
    if [[ -f "$repo_root/.env" ]]; then
        log_info "Copying .env file..."
        cp "$repo_root/.env" "$worktree_path/.env"
        log_success ".env copied"
    else
        log_warn "No .env file found in main repo"
    fi

    # Copy Claude local settings if it exists
    if [[ -f "$repo_root/.claude/settings.local.json" ]]; then
        log_info "Copying Claude local settings..."
        mkdir -p "$worktree_path/.claude"
        cp "$repo_root/.claude/settings.local.json" "$worktree_path/.claude/settings.local.json"
        log_success "Claude settings copied"
    else
        log_warn "No .claude/settings.local.json found in main repo"
    fi

    # Set default model if specified
    if [[ -n "$model" ]]; then
        log_info "Setting default model to: $model"
        mkdir -p "$worktree_path/.claude"

        # Create or update settings.local.json with the model
        if [[ ! -f "$worktree_path/.claude/settings.local.json" ]]; then
            echo "{}" > "$worktree_path/.claude/settings.local.json"
        fi

        # Update the JSON file with the model using jq if available, else use sed
        if command -v jq &> /dev/null; then
            # Use jq to safely update JSON (preferred method)
            if jq ".model = \"$model\"" "$worktree_path/.claude/settings.local.json" > "$worktree_path/.claude/settings.local.json.tmp" 2>/dev/null; then
                mv "$worktree_path/.claude/settings.local.json.tmp" "$worktree_path/.claude/settings.local.json"
                log_success "Default model set to: $model (via jq)"
            else
                log_warn "jq update failed, falling back to sed"
                rm -f "$worktree_path/.claude/settings.local.json.tmp"
                # Fallback to sed if jq fails
                set_model_with_sed "$worktree_path/.claude/settings.local.json" "$model" || {
                    log_error "Failed to set model in settings.local.json"
                    return 1
                }
            fi
        else
            # No jq available, use sed fallback
            log_warn "jq not found, using sed for JSON update (may be less reliable)"
            set_model_with_sed "$worktree_path/.claude/settings.local.json" "$model" || {
                log_error "Failed to set model in settings.local.json"
                return 1
            }
        fi

        # Verify the model was actually set
        if verify_model_setting "$worktree_path/.claude/settings.local.json" "$model"; then
            log_success "Model configuration verified: $model"
        else
            log_warn "Could not verify model setting, but configuration was attempted"
            log_warn "You may need to manually add the model to .claude/settings.local.json"
        fi
    fi

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
Claude Worktree Manager

Usage:
    $0 create <name> [OPTIONS]     Create a new worktree with auto-setup
    $0 list                        List all worktrees for the current project
    $0 cleanup [--days N]          Cleanup worktrees older than N days (default: 7)
    $0 help                        Show this help message

Options:
    --isolated    Create a dedicated database for this worktree and seed it with test data.
                  Use this for schema changes, migration testing, or isolated experiments.
    --model       Set the default Claude model for this worktree (opus, sonnet, haiku).
                  Configures .claude/settings.local.json with the selected model.

Examples:
    $0 create staging-env                    # Uses shared dev database
    $0 create dark-mode-feature              # Uses shared dev database
    $0 create schema-changes --isolated      # Creates dedicated database with seeding
    $0 create feature-x --model opus         # Sets Opus as default model
    $0 create complex-task --model opus --isolated # Opus + isolated DB
    $0 list
    $0 cleanup
    $0 cleanup --days 14

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
            local model=""

            # Parse optional flags
            shift 2
            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --isolated)
                        isolated="true"
                        shift
                        ;;
                    --model)
                        if [[ $# -lt 2 ]]; then
                            log_error "Missing model name for --model flag"
                            exit 1
                        fi
                        model="$2"
                        # Validate model
                        case "$model" in
                            opus|sonnet|haiku)
                                shift 2
                                ;;
                            *)
                                log_error "Invalid model: $model. Must be one of: opus, sonnet, haiku"
                                exit 1
                                ;;
                        esac
                        ;;
                    *)
                        log_error "Unknown option: $1"
                        echo ""
                        usage
                        exit 1
                        ;;
                esac
            done

            create_worktree "$name" "$isolated" "$model"
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
