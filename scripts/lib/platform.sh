#!/usr/bin/env bash
# =============================================================================
# Orient - Cross-Platform Utilities
# =============================================================================
# Provides platform detection and cross-platform compatibility functions.
# Source this file in other scripts: source "$SCRIPT_DIR/lib/platform.sh"
# =============================================================================

# Detect operating system: macos, linux, wsl, unknown
detect_os() {
  case "$(uname -s)" in
    Darwin*) echo "macos" ;;
    Linux*)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "wsl"
      else
        echo "linux"
      fi
      ;;
    *) echo "unknown" ;;
  esac
}

# Cross-platform sed in-place edit
# Usage: sed_inplace "file.txt" "s/old/new/g"
# Note: On macOS, sed -i requires '' as a separate argument
#       On Linux/WSL, sed -i takes the pattern directly
sed_inplace() {
  local file="$1"
  shift
  if [[ "$(detect_os)" == "macos" ]]; then
    sed -i '' "$@" "$file"
  else
    sed -i "$@" "$file"
  fi
}

# Detect package manager (for doctor.sh hints)
# Returns: apt, brew, dnf, pacman, or unknown
detect_package_manager() {
  if command -v apt &>/dev/null; then
    echo "apt"
  elif command -v brew &>/dev/null; then
    echo "brew"
  elif command -v dnf &>/dev/null; then
    echo "dnf"
  elif command -v pacman &>/dev/null; then
    echo "pacman"
  else
    echo "unknown"
  fi
}

# Get install command for a package based on package manager
# Usage: get_install_hint "jq"
# Returns the command to install the package, or empty string if unknown
get_install_hint() {
  local package="$1"
  local pm=$(detect_package_manager)

  case "$pm" in
    apt)
      case "$package" in
        node|nodejs) echo "Install via nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash && nvm install 20" ;;
        docker) echo "Install: curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker \$USER" ;;
        envsubst) echo "sudo apt install gettext-base" ;;
        jq) echo "sudo apt install jq" ;;
        lsof) echo "sudo apt install lsof" ;;
        curl) echo "sudo apt install curl" ;;
        git) echo "sudo apt install git" ;;
        *) echo "sudo apt install $package" ;;
      esac
      ;;
    brew)
      case "$package" in
        node|nodejs) echo "brew install node@20 OR use nvm" ;;
        docker) echo "Install Docker Desktop from https://docs.docker.com/desktop/install/mac-install/" ;;
        envsubst) echo "brew install gettext" ;;
        *) echo "brew install $package" ;;
      esac
      ;;
    dnf)
      case "$package" in
        node|nodejs) echo "Install via nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash && nvm install 20" ;;
        docker) echo "sudo dnf install docker-ce docker-ce-cli containerd.io && sudo systemctl start docker" ;;
        envsubst) echo "sudo dnf install gettext" ;;
        *) echo "sudo dnf install $package" ;;
      esac
      ;;
    pacman)
      case "$package" in
        node|nodejs) echo "sudo pacman -S nodejs npm OR use nvm" ;;
        docker) echo "sudo pacman -S docker && sudo systemctl start docker" ;;
        envsubst) echo "sudo pacman -S gettext" ;;
        *) echo "sudo pacman -S $package" ;;
      esac
      ;;
    *)
      echo ""
      ;;
  esac
}
