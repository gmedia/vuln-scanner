#!/bin/sh
set -e

DOMAIN="${DOMAIN:-localhost}"

sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/conf.d/default.conf

LETSENCRYPT_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ ! -f "$LETSENCRYPT_DIR/fullchain.pem" ]; then
    echo "No Let's Encrypt certificates found for $DOMAIN — generating self-signed cert for development"
    mkdir -p "$LETSENCRYPT_DIR"
    openssl req -x509 -nodes -newkey rsa:4096 -days 365 \
        -keyout "$LETSENCRYPT_DIR/privkey.pem" \
        -out "$LETSENCRYPT_DIR/fullchain.pem" \
        -subj "/CN=$DOMAIN" 2>/dev/null
    cp "$LETSENCRYPT_DIR/fullchain.pem" "$LETSENCRYPT_DIR/chain.pem"
    echo "Self-signed certificate created for $DOMAIN"
fi

crond -b -l 2
exec nginx -g "daemon off;"
