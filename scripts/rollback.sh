#!/bin/sh
set -e
echo "Rolling back to previous deployment..."
docker tag vuln-backend:previous vuln-backend:rollback-target 2>/dev/null || { echo "No previous image for backend"; exit 1; }
docker tag vuln-frontend:previous vuln-frontend:rollback-target
docker tag vuln-worker-ip:previous vuln-worker-ip:rollback-target
docker tag vuln-worker-domain:previous vuln-worker-domain:rollback-target
docker tag vuln-worker-mobile:previous vuln-worker-mobile:rollback-target
docker compose -f docker-compose.prod.yml down
docker tag vuln-backend:rollback-target vuln-backend:latest
docker tag vuln-frontend:rollback-target vuln-frontend:latest
docker tag vuln-worker-ip:rollback-target vuln-worker-ip:latest
docker tag vuln-worker-domain:rollback-target vuln-worker-domain:latest
docker tag vuln-worker-mobile:rollback-target vuln-worker-mobile:latest
docker compose -f docker-compose.prod.yml up -d --wait
echo "Rollback complete"
