#!/bin/bash
# Development container entrypoint
# Fixes Docker socket permissions for macOS Docker Desktop
# Then drops to the node user to run the actual command

set -e

# Target user to run as
TARGET_USER="${TARGET_USER:-node}"
TARGET_UID=$(id -u "$TARGET_USER" 2>/dev/null || echo "501")

# Fix Docker socket permissions if it exists and we're running as root
if [ -S /var/run/docker.sock ] && [ "$(id -u)" = "0" ]; then
    # Make socket accessible to all users (safe in dev container)
    chmod 666 /var/run/docker.sock 2>/dev/null || true
fi

# If running as root, switch to target user
if [ "$(id -u)" = "0" ]; then
    # Use gosu if available, otherwise su
    if command -v gosu >/dev/null 2>&1; then
        exec gosu "$TARGET_USER" "$@"
    else
        exec su -s /bin/bash "$TARGET_USER" -c "$*"
    fi
else
    # Already running as non-root, just exec
    exec "$@"
fi
