#!/usr/bin/env bash
set -e

DOMAIN="${DOMAIN:-localhost}"
EMAIL="${EMAIL:-admin@example.com}"

echo "Starting certbot certificate issuance for domain: $DOMAIN"
echo "Email: $EMAIL"

docker compose up -d nginx

docker compose run --rm nginx certbot certonly --webroot \
    -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email

echo "Certificate issued successfully for $DOMAIN"
echo "Reloading nginx..."
docker compose exec nginx nginx -s reload
echo "Done!"
