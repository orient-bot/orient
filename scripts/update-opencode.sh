#!/usr/bin/env bash
#
# Update OpenCode binaries in vendor/opencode/
# Downloads binaries for all platforms from GitHub releases and updates manifest.json
#
# Usage: ./scripts/update-opencode.sh <version>
# Example: ./scripts/update-opencode.sh 1.1.48
#
# Source: https://github.com/anomalyco/opencode/releases
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor/opencode"
MANIFEST_FILE="$VENDOR_DIR/manifest.json"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# GitHub repo for OpenCode releases
GITHUB_REPO="anomalyco/opencode"

# Get the download URL for a platform
# anomalyco/opencode uses: darwin-arm64.zip, darwin-x64.zip, linux-arm64.tar.gz, linux-x64.tar.gz
get_download_url() {
    local version="$1"
    local platform="$2"
    local ext

    # Darwin uses .zip, Linux uses .tar.gz
    case "$platform" in
        darwin-*) ext="zip" ;;
        linux-*) ext="tar.gz" ;;
        *) ext="tar.gz" ;;
    esac

    echo "https://github.com/${GITHUB_REPO}/releases/download/v${version}/opencode-${platform}.${ext}"
}

PLATFORMS="darwin-arm64 darwin-x64 linux-arm64 linux-x64"

usage() {
    echo "Usage: $0 <version>"
    echo ""
    echo "Downloads OpenCode binaries for all platforms and updates manifest.json"
    echo "Source: https://github.com/${GITHUB_REPO}/releases"
    echo ""
    echo "Arguments:"
    echo "  version    The version to download (e.g., 1.1.48)"
    echo ""
    echo "Options:"
    echo "  --help     Show this help message"
    echo "  --current  Show current bundled version"
    echo "  --latest   Download the latest version"
    echo ""
    echo "Examples:"
    echo "  $0 1.1.48"
    echo "  $0 --latest"
    echo "  $0 --current"
}

show_current() {
    if [[ -f "$MANIFEST_FILE" ]]; then
        local version
        version=$(jq -r '.version' "$MANIFEST_FILE")
        echo "Current bundled version: $version"
    else
        echo "No manifest found at $MANIFEST_FILE"
        exit 1
    fi
}

download_binary() {
    local version="$1"
    local platform="$2"
    local url
    url=$(get_download_url "$version" "$platform")
    local target_dir="$VENDOR_DIR/$platform"
    local temp_dir
    temp_dir=$(mktemp -d)
    local archive_file="$temp_dir/opencode-archive"

    log_info "Downloading $platform from $url..."

    # Download archive
    if ! curl -fsSL "$url" -o "$archive_file"; then
        log_error "Failed to download $url"
        rm -rf "$temp_dir"
        return 1
    fi

    # Extract based on platform (darwin=zip, linux=tar.gz)
    case "$platform" in
        darwin-*)
            if ! unzip -q "$archive_file" -d "$temp_dir"; then
                log_error "Failed to extract zip for $platform"
                rm -rf "$temp_dir"
                return 1
            fi
            ;;
        linux-*)
            if ! tar -xzf "$archive_file" -C "$temp_dir"; then
                log_error "Failed to extract tarball for $platform"
                rm -rf "$temp_dir"
                return 1
            fi
            ;;
    esac

    # Find the binary (might be in a subdirectory or at root)
    local binary_path
    binary_path=$(find "$temp_dir" -name "opencode" -type f | head -1)

    if [[ -z "$binary_path" ]]; then
        log_error "Could not find opencode binary in extracted archive for $platform"
        rm -rf "$temp_dir"
        return 1
    fi

    # Move to target directory
    mkdir -p "$target_dir"
    mv "$binary_path" "$target_dir/opencode"
    chmod +x "$target_dir/opencode"

    # Clean up
    rm -rf "$temp_dir"

    log_info "Downloaded $platform binary"
}

calculate_checksum() {
    local platform="$1"
    local binary="$VENDOR_DIR/$platform/opencode"

    if [[ ! -f "$binary" ]]; then
        log_error "Binary not found: $binary"
        return 1
    fi

    if command -v sha256sum &> /dev/null; then
        sha256sum "$binary" | cut -d' ' -f1
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$binary" | cut -d' ' -f1
    else
        log_error "No sha256sum or shasum command found"
        return 1
    fi
}

update_manifest() {
    local version="$1"
    local updated_at
    updated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    log_info "Updating manifest.json..."

    # Build checksums object
    local checksums="{}"
    for platform in $PLATFORMS; do
        local checksum
        checksum=$(calculate_checksum "$platform")
        checksums=$(echo "$checksums" | jq --arg p "$platform" --arg c "$checksum" \
            '.[$p] = {"filename": "opencode", "sha256": $c}')
    done

    # Update manifest
    jq --arg v "$version" --arg t "$updated_at" --argjson b "$checksums" \
        '.version = $v | .updated_at = $t | .binaries = $b' \
        "$MANIFEST_FILE" > "$MANIFEST_FILE.tmp"
    mv "$MANIFEST_FILE.tmp" "$MANIFEST_FILE"

    log_info "Manifest updated with version $version"
}

verify_binary() {
    local platform="$1"
    local binary="$VENDOR_DIR/$platform/opencode"

    # Only verify binaries for current platform
    local current_os current_arch current_platform
    current_os=$(uname -s | tr '[:upper:]' '[:lower:]')
    current_arch=$(uname -m)

    # Map to our naming
    [[ "$current_os" == "darwin" ]] && current_os="darwin"
    [[ "$current_os" == "linux" ]] && current_os="linux"
    [[ "$current_arch" == "arm64" || "$current_arch" == "aarch64" ]] && current_arch="arm64"
    [[ "$current_arch" == "x86_64" ]] && current_arch="x64"
    current_platform="${current_os}-${current_arch}"

    if [[ "$platform" == "$current_platform" ]]; then
        log_info "Verifying $platform binary (current platform)..."
        if "$binary" --version &>/dev/null; then
            local version_output
            version_output=$("$binary" --version 2>&1 || true)
            log_info "Binary works: $version_output"
        else
            log_warn "Binary verification failed (may be expected for different arch)"
        fi
    else
        log_info "Skipping verification for $platform (not current platform)"
    fi
}

main() {
    # Parse arguments
    if [[ $# -eq 0 ]] || [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
        usage
        exit 0
    fi

    if [[ "$1" == "--current" ]]; then
        show_current
        exit 0
    fi

    if [[ "$1" == "--latest" ]]; then
        log_info "Fetching latest version from GitHub..."
        local latest_version
        latest_version=$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | \
            jq -r '.tag_name' | sed 's/^v//')
        if [[ -z "$latest_version" ]] || [[ "$latest_version" == "null" ]]; then
            log_error "Failed to fetch latest version"
            exit 1
        fi
        log_info "Latest version: $latest_version"
        set -- "$latest_version"  # Replace args with the version
    fi

    local version="$1"

    # Validate version format (simple check)
    if ! [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        log_error "Invalid version format: $version (expected: X.Y.Z)"
        exit 1
    fi

    # Check dependencies
    if ! command -v jq &> /dev/null; then
        log_error "jq is required but not installed"
        exit 1
    fi

    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi

    log_info "Updating OpenCode to version $version"
    log_info "Target directory: $VENDOR_DIR"

    # Download all binaries
    for platform in $PLATFORMS; do
        if ! download_binary "$version" "$platform"; then
            log_error "Failed to download $platform"
            exit 1
        fi
    done

    # Update manifest with checksums
    update_manifest "$version"

    # Verify binaries (only for current platform)
    for platform in $PLATFORMS; do
        verify_binary "$platform"
    done

    log_info "OpenCode update complete!"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Review changes: git diff vendor/opencode/"
    log_info "  2. Stage changes: git add vendor/opencode/ .gitattributes"
    log_info "  3. Commit: git commit -m 'chore: update OpenCode to v$version'"
}

main "$@"
