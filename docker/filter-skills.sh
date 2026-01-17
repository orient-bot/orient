#!/bin/bash
# Filter Skills Script
#
# Removes excluded skills from the skills directory based on the 
# .skills-exclusions.json manifest and DEPLOY_ENV environment variable.
#
# Usage: filter-skills.sh [environment]
#   environment: 'local' or 'prod' (defaults to DEPLOY_ENV or 'local')
#
# This script is called during container startup to apply skill exclusions.

set -e

# Configuration
SKILLS_DIR="${SKILLS_DIR:-/home/opencode/pm-assistant/.claude/skills}"
MANIFEST_PATH="${MANIFEST_PATH:-/tmp/.skills-exclusions.json}"
ENV="${1:-${DEPLOY_ENV:-local}}"

log() {
    echo "[filter-skills] $1"
}

log_error() {
    echo "[filter-skills] ERROR: $1" >&2
}

# Check if manifest exists
if [ ! -f "$MANIFEST_PATH" ]; then
    log "No skills exclusions manifest found at $MANIFEST_PATH - keeping all skills"
    exit 0
fi

# Check if skills directory exists
if [ ! -d "$SKILLS_DIR" ]; then
    log_error "Skills directory not found: $SKILLS_DIR"
    exit 1
fi

# Check for jq
if ! command -v jq &> /dev/null; then
    log "jq not installed - cannot parse manifest, keeping all skills"
    exit 0
fi

# Get excluded skills based on environment
if [ "$ENV" = "prod" ]; then
    EXCLUDED_SKILLS=$(jq -r '.prod.excludeSkills[]' "$MANIFEST_PATH" 2>/dev/null || echo "")
else
    EXCLUDED_SKILLS=$(jq -r '.local.excludeSkills[]' "$MANIFEST_PATH" 2>/dev/null || echo "")
fi

# Check if there are any exclusions
if [ -z "$EXCLUDED_SKILLS" ]; then
    log "No skills to exclude for environment: $ENV"
    exit 0
fi

log "Filtering skills for environment: $ENV"

# Remove excluded skills
REMOVED_COUNT=0
for skill in $EXCLUDED_SKILLS; do
    SKILL_PATH="$SKILLS_DIR/$skill"
    if [ -d "$SKILL_PATH" ]; then
        log "  Removing excluded skill: $skill"
        rm -rf "$SKILL_PATH"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    else
        log "  Skill not found (already removed?): $skill"
    fi
done

log "Removed $REMOVED_COUNT excluded skills"

# List remaining skills
REMAINING=$(ls -1 "$SKILLS_DIR" 2>/dev/null | wc -l)
log "Remaining skills: $REMAINING"


