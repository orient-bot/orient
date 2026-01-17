#!/bin/bash
# =============================================================================
# SSL Certificate Auto-Renewal Script
# =============================================================================
# This script renews Let's Encrypt certificates for configured domains.
# Run via cron: 0 3 * * * /home/opc/orient/docker/ssl-renew.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORIENT_ROOT="${ORIENT_ROOT:-/home/opc/orient}"
LOG_FILE="${ORIENT_ROOT}/logs/ssl-renew.log"
CERTBOT_IMAGE="certbot/certbot:arm64v8-latest"
CERT_PATH="${ORIENT_ROOT}/certbot/conf"

# Domains to manage
# Set ORIENT_SSL_DOMAINS="app.example.com,code.example.com" or use
# ORIENT_APP_DOMAIN / ORIENT_CODE_DOMAIN env vars.
DOMAINS=()
if [ -n "${ORIENT_SSL_DOMAINS:-}" ]; then
    IFS=',' read -r -a DOMAINS <<< "$ORIENT_SSL_DOMAINS"
else
    if [ -n "${ORIENT_APP_DOMAIN:-}" ]; then DOMAINS+=("$ORIENT_APP_DOMAIN"); fi
    if [ -n "${ORIENT_CODE_DOMAIN:-}" ]; then DOMAINS+=("$ORIENT_CODE_DOMAIN"); fi
fi

if [ "${#DOMAINS[@]}" -eq 0 ]; then
    echo "No SSL domains configured. Set ORIENT_SSL_DOMAINS or ORIENT_APP_DOMAIN/ORIENT_CODE_DOMAIN."
    exit 1
fi

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_cert_needs_renewal() {
    local domain="$1"
    local cert_file="$CERT_PATH/live/$domain/fullchain.pem"
    
    if [ ! -f "$cert_file" ]; then
        log "[$domain] Certificate file not found. Needs issuance."
        return 0  # Needs renewal/issuance
    fi
    
    EXPIRY_DATE=$(openssl x509 -enddate -noout -in "$cert_file" | cut -d= -f2)
    EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$EXPIRY_DATE" +%s)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
    
    log "[$domain] Certificate expires in $DAYS_LEFT days ($EXPIRY_DATE)"
    
    if [ "$DAYS_LEFT" -le 30 ]; then
        return 0  # Needs renewal
    fi
    
    return 1  # Doesn't need renewal
}

log "Starting SSL certificate renewal check..."

# Check if any domain needs renewal
NEEDS_RENEWAL=false
for domain in "${DOMAINS[@]}"; do
    if check_cert_needs_renewal "$domain"; then
        NEEDS_RENEWAL=true
        log "[$domain] Renewal needed."
    else
        log "[$domain] Certificate still valid for more than 30 days."
    fi
done

if [ "$NEEDS_RENEWAL" = false ]; then
    log "All certificates are valid. Skipping renewal."
    exit 0
fi

log "At least one certificate needs renewal. Proceeding..."

cd "$SCRIPT_DIR"

# Stop nginx to free port 80
log "Stopping nginx..."
sudo docker compose stop nginx

# Run certbot renewal for all domains
log "Running certbot renewal..."
if sudo docker run --rm \
    -p 80:80 \
    -v "$CERT_PATH:/etc/letsencrypt" \
    "$CERTBOT_IMAGE" renew --standalone --non-interactive; then
    log "Certificate renewal successful!"
else
    log "Certificate renewal failed or nothing to renew!"
    # Still restart nginx even if renewal failed
fi

# Restart nginx
log "Starting nginx..."
sudo docker compose up -d nginx

# Verify nginx is healthy for both domains
sleep 5
HEALTHY=true
for domain in "${DOMAINS[@]}"; do
    if curl -sf "https://$domain/health" > /dev/null 2>&1; then
        log "[$domain] HTTPS is working."
    else
        log "[$domain] WARNING: HTTPS may not be healthy. Please check manually."
        HEALTHY=false
    fi
done

if [ "$HEALTHY" = true ]; then
    log "Nginx restarted successfully. All domains are healthy."
else
    log "WARNING: Some domains may not be healthy. Please check manually."
fi

log "SSL renewal process completed."
