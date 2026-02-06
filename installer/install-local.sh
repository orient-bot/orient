#!/usr/bin/env bash
#
# Install OpenCode from bundled binary (local development)
#
# This script installs the bundled OpenCode binary to ~/.opencode/bin/
# ensuring the local development environment uses the same version
# that's bundled with the repo (tracked via Git LFS).
#
# Usage:
#   ./installer/install-local.sh           # Install bundled binary
#   ./installer/install-local.sh --check   # Check versions only
#   ./installer/install-local.sh --force   # Force reinstall
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor/opencode"
MANIFEST_FILE="$VENDOR_DIR/manifest.json"
INSTALL_DIR="$HOME/.opencode/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_step() { echo -e "${BLUE}[STEP]${NC} $*"; }

# Detect current platform
detect_platform() {
    local os arch

    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)

    # Normalize architecture
    case "$arch" in
        arm64|aarch64) arch="arm64" ;;
        x86_64|amd64) arch="x64" ;;
        *)
            log_error "Unsupported architecture: $arch"
            exit 1
            ;;
    esac

    # Normalize OS
    case "$os" in
        darwin|linux) ;;
        *)
            log_error "Unsupported OS: $os"
            exit 1
            ;;
    esac

    echo "${os}-${arch}"
}

# Get bundled version from manifest
get_bundled_version() {
    if [[ ! -f "$MANIFEST_FILE" ]]; then
        log_error "Manifest not found: $MANIFEST_FILE"
        log_error "Run 'git lfs pull' to fetch bundled binaries"
        exit 1
    fi
    jq -r '.version' "$MANIFEST_FILE"
}

# Get installed version
get_installed_version() {
    if command -v opencode &> /dev/null; then
        opencode --version 2>&1 | tail -1 || echo "unknown"
    else
        echo "not installed"
    fi
}

# Get checksum from manifest
get_expected_checksum() {
    local platform="$1"
    jq -r ".binaries[\"$platform\"].sha256" "$MANIFEST_FILE"
}

# Calculate checksum of a file
calculate_checksum() {
    local file="$1"
    if command -v sha256sum &> /dev/null; then
        sha256sum "$file" | cut -d' ' -f1
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$file" | cut -d' ' -f1
    else
        log_error "No checksum command available (sha256sum or shasum)"
        exit 1
    fi
}

# Verify binary checksum
verify_checksum() {
    local binary="$1"
    local platform="$2"

    local expected actual
    expected=$(get_expected_checksum "$platform")
    actual=$(calculate_checksum "$binary")

    if [[ "$expected" != "$actual" ]]; then
        log_error "Checksum verification failed!"
        log_error "  Expected: $expected"
        log_error "  Actual:   $actual"
        return 1
    fi
    return 0
}

# Check if binary is an LFS pointer (not actual binary)
check_lfs_fetched() {
    local binary="$1"
    local size

    if [[ ! -f "$binary" ]]; then
        return 1
    fi

    # LFS pointers are small text files (~130 bytes)
    size=$(stat -f%z "$binary" 2>/dev/null || stat -c%s "$binary" 2>/dev/null)
    if [[ "$size" -lt 1000000 ]]; then
        return 1  # Likely an LFS pointer, not actual binary
    fi
    return 0
}

# Show version check
check_versions() {
    local platform bundled_version installed_version

    platform=$(detect_platform)
    bundled_version=$(get_bundled_version)
    installed_version=$(get_installed_version)

    echo ""
    echo -e "${BLUE}OpenCode Version Check${NC}"
    echo "────────────────────────────────────────"
    echo -e "  Platform:         ${platform}"
    echo -e "  Bundled version:  ${GREEN}${bundled_version}${NC}"
    echo -e "  Installed version: ${installed_version}"
    echo ""

    if [[ "$installed_version" == "$bundled_version" ]]; then
        echo -e "${GREEN}✓ Versions match${NC}"
        return 0
    elif [[ "$installed_version" == "not installed" ]]; then
        echo -e "${YELLOW}⚠ OpenCode not installed${NC}"
        echo "  Run: ./installer/install-local.sh"
        return 1
    else
        echo -e "${YELLOW}⚠ Version mismatch${NC}"
        echo "  Run: ./installer/install-local.sh --force"
        return 1
    fi
}

# Install the bundled binary
install_binary() {
    local force="${1:-false}"
    local platform bundled_version installed_version source_binary

    platform=$(detect_platform)
    bundled_version=$(get_bundled_version)
    installed_version=$(get_installed_version)
    source_binary="$VENDOR_DIR/$platform/opencode"

    log_step "Installing OpenCode v${bundled_version} for ${platform}"

    # Check if already installed and matching
    if [[ "$force" != "true" ]] && [[ "$installed_version" == "$bundled_version" ]]; then
        log_info "OpenCode v${bundled_version} is already installed"
        return 0
    fi

    # Check source binary exists and is not LFS pointer
    if [[ ! -f "$source_binary" ]]; then
        log_error "Bundled binary not found: $source_binary"
        log_error "Run 'git lfs pull' to fetch bundled binaries"
        exit 1
    fi

    if ! check_lfs_fetched "$source_binary"; then
        log_error "Binary appears to be an LFS pointer, not actual binary"
        log_error "Run 'git lfs pull' to fetch bundled binaries"
        exit 1
    fi

    # Verify checksum
    log_step "Verifying checksum..."
    if ! verify_checksum "$source_binary" "$platform"; then
        log_error "Checksum verification failed"
        exit 1
    fi
    log_info "Checksum verified"

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Copy binary
    log_step "Installing to $INSTALL_DIR/opencode..."
    cp "$source_binary" "$INSTALL_DIR/opencode"
    chmod +x "$INSTALL_DIR/opencode"

    # Verify installation
    log_step "Verifying installation..."
    local new_version
    new_version=$("$INSTALL_DIR/opencode" --version 2>&1 | tail -1)

    if [[ "$new_version" != "$bundled_version" ]]; then
        log_error "Installation verification failed"
        log_error "Expected: $bundled_version"
        log_error "Got: $new_version"
        exit 1
    fi

    log_info "OpenCode v${bundled_version} installed successfully!"

    # Check PATH
    if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
        log_warn "$INSTALL_DIR is not in your PATH"
        log_warn "Add to your shell profile:"
        log_warn "  export PATH=\"$INSTALL_DIR:\$PATH\""
    fi

    echo ""
    echo -e "${GREEN}Installation complete!${NC}"
    echo "  Binary:  $INSTALL_DIR/opencode"
    echo "  Version: $new_version"
}

# Main
main() {
    local force=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check|-c)
                check_versions
                return
                ;;
            --force|-f)
                force=true
                ;;
            --verbose|-v)
                # Accepted for compatibility with test-install.sh (currently no-op)
                ;;
            --help|-h)
                echo "Usage: $0 [--check|--force|--verbose|--help]"
                echo ""
                echo "Install bundled OpenCode binary for local development."
                echo ""
                echo "Options:"
                echo "  --check     Check versions without installing"
                echo "  --force     Force reinstall even if versions match"
                echo "  --verbose   Verbose output (for test compatibility)"
                echo "  --help      Show this help"
                return
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Run: $0 --help"
                exit 1
                ;;
        esac
        shift
    done

    install_binary "$force"
}

main "$@"
