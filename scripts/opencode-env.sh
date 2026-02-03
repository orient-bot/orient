#!/usr/bin/env bash
#
# OpenCode Environment Isolation
# Ensures OpenCode uses project-local data and does NOT load configuration
# from the user's global ~/.opencode/ or ~/.config/opencode/ directories.
#
# Environment Variables:
#   OPENCODE_USE_GLOBAL_CONFIG=true  - Opt-in to use global OpenCode config
#   PROJECT_ROOT                      - Project root directory (defaults to pwd)
#

# Configure OpenCode to use project-local directories instead of global ones
# This prevents interference with user's global OpenCode installation
configure_opencode_isolation() {
    local project_root="${PROJECT_ROOT:-$(pwd)}"
    local opencode_home="$project_root/.opencode"

    # Check for opt-in to use global config
    if [ "$OPENCODE_USE_GLOBAL_CONFIG" = "true" ]; then
        if [ -n "$OPENCODE_ISOLATION_LOG" ]; then
            echo "[OPENCODE] Using global OpenCode configuration (OPENCODE_USE_GLOBAL_CONFIG=true)"
        fi
        return 0
    fi

    # Create isolation directories
    # OpenCode expects these subdirectories under XDG paths
    # Note: data/opencode is where mcp-auth.json is stored (OAuth tokens)
    mkdir -p "$opencode_home/data/opencode/storage"
    mkdir -p "$opencode_home/data/opencode"  # Parent dir for mcp-auth.json
    mkdir -p "$opencode_home/config/opencode"
    mkdir -p "$opencode_home/cache/opencode"
    mkdir -p "$opencode_home/state/opencode"

    # OPENCODE_TEST_HOME: Overrides os.homedir() in OpenCode
    # This redirects ~/.opencode/ scanning to our isolated directory
    export OPENCODE_TEST_HOME="$opencode_home"

    # XDG Base Directory variables for complete isolation
    # These redirect all XDG-compliant paths to our project-local directories
    export XDG_DATA_HOME="$opencode_home/data"
    export XDG_CONFIG_HOME="$opencode_home/config"
    export XDG_CACHE_HOME="$opencode_home/cache"
    export XDG_STATE_HOME="$opencode_home/state"

    # Explicit config path - prefer local overrides
    if [ -f "$project_root/opencode.local.json" ]; then
        export OPENCODE_CONFIG="$project_root/opencode.local.json"
    elif [ -f "$project_root/opencode.json" ]; then
        export OPENCODE_CONFIG="$project_root/opencode.json"
    fi

    if [ -n "$OPENCODE_ISOLATION_LOG" ]; then
        echo "[OPENCODE] Isolation configured:"
        echo "[OPENCODE]   OPENCODE_TEST_HOME=$OPENCODE_TEST_HOME"
        echo "[OPENCODE]   XDG_DATA_HOME=$XDG_DATA_HOME"
        echo "[OPENCODE]   XDG_CONFIG_HOME=$XDG_CONFIG_HOME"
        echo "[OPENCODE]   XDG_CACHE_HOME=$XDG_CACHE_HOME"
        echo "[OPENCODE]   XDG_STATE_HOME=$XDG_STATE_HOME"
        echo "[OPENCODE]   OPENCODE_CONFIG=$OPENCODE_CONFIG"
    fi
}

# Verify isolation is active (useful for debugging)
verify_opencode_isolation() {
    local project_root="${PROJECT_ROOT:-$(pwd)}"
    local opencode_home="$project_root/.opencode"
    local errors=0

    echo "[OPENCODE] Verifying isolation..."

    # Check OPENCODE_TEST_HOME
    if [ "$OPENCODE_TEST_HOME" != "$opencode_home" ]; then
        echo "[OPENCODE] ERROR: OPENCODE_TEST_HOME not set correctly"
        echo "[OPENCODE]   Expected: $opencode_home"
        echo "[OPENCODE]   Actual: $OPENCODE_TEST_HOME"
        errors=$((errors + 1))
    fi

    # Check XDG variables don't point to home directory
    # Using eval for POSIX-compatible indirect variable expansion
    for var in XDG_DATA_HOME XDG_CONFIG_HOME XDG_CACHE_HOME XDG_STATE_HOME; do
        local value
        eval "value=\$$var"
        if [ -n "$value" ]; then
            case "$value" in
                "$HOME"*)
                    case "$value" in
                        "$opencode_home"*) ;;  # OK, points to project .opencode
                        *)
                            echo "[OPENCODE] ERROR: $var points to home directory: $value"
                            errors=$((errors + 1))
                            ;;
                    esac
                    ;;
            esac
        fi
    done

    if [ $errors -eq 0 ]; then
        echo "[OPENCODE] Isolation verified successfully"
        return 0
    else
        echo "[OPENCODE] Isolation verification failed with $errors error(s)"
        return 1
    fi
}

# Export functions for use in other scripts
export -f configure_opencode_isolation 2>/dev/null || true
export -f verify_opencode_isolation 2>/dev/null || true
