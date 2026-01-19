#!/usr/bin/env bash
# Verify Claude model configuration in a worktree
# Usage: ./verify-worktree-model.sh [worktree-path]

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Helper functions
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

# Get worktree path
if [[ $# -eq 0 ]]; then
    # Use current directory as worktree path
    WORKTREE_PATH="$(pwd)"
else
    WORKTREE_PATH="$1"
fi

# Verify it's a valid git repository or worktree
if ! git -C "$WORKTREE_PATH" rev-parse --git-dir &>/dev/null; then
    log_error "Not a git repository or worktree: $WORKTREE_PATH"
    exit 1
fi

SETTINGS_FILE="$WORKTREE_PATH/.claude/settings.local.json"

log_info "Verifying Claude model configuration in: $WORKTREE_PATH"
echo ""

# Check if settings file exists
if [[ ! -f "$SETTINGS_FILE" ]]; then
    log_warn "No .claude/settings.local.json found in worktree"
    echo ""
    echo "To fix: Create the file with:"
    echo "  mkdir -p $WORKTREE_PATH/.claude"
    echo "  echo '{\"model\": \"opus\"}' > $SETTINGS_FILE"
    exit 1
fi

log_success ".claude/settings.local.json found"

# Try to extract model using jq
if command -v jq &> /dev/null; then
    MODEL=$(jq -r '.model // empty' "$SETTINGS_FILE" 2>/dev/null || echo "")

    if [[ -n "$MODEL" ]]; then
        log_success "Model configuration found: $MODEL"
        echo ""

        # Validate model value
        case "$MODEL" in
            opus|sonnet|haiku)
                log_success "Model is valid: $MODEL"
                exit 0
                ;;
            *)
                log_error "Invalid model value: $MODEL"
                echo "Valid options are: opus, sonnet, haiku"
                exit 1
                ;;
        esac
    else
        log_warn "No model configuration found in settings.local.json"
    fi
else
    # Fallback to grep if jq is not available
    log_warn "jq not available, using grep for extraction"

    if grep -q '"model"' "$SETTINGS_FILE"; then
        # Extract model value using grep and sed
        MODEL=$(grep -o '"model": "[^"]*"' "$SETTINGS_FILE" | grep -o '[^"]*"$' | sed 's/"$//' || echo "")

        if [[ -n "$MODEL" ]]; then
            log_success "Model configuration found: $MODEL"
            echo ""

            # Validate model value
            case "$MODEL" in
                opus|sonnet|haiku)
                    log_success "Model is valid: $MODEL"
                    exit 0
                    ;;
                *)
                    log_error "Invalid model value: $MODEL"
                    echo "Valid options are: opus, sonnet, haiku"
                    exit 1
                    ;;
            esac
        fi
    else
        log_warn "No model configuration found in settings.local.json"
    fi
fi

echo ""
echo "To set the model manually, edit the file:"
echo "  $SETTINGS_FILE"
echo ""
echo "Example with opus:"
echo '  { "model": "opus", "permissions": { ... } }'
echo ""
exit 1
