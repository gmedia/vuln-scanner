#!/bin/sh
set -e

# Ensure temp directories exist and are owned by nginx user (uid 101).
# Required because nginx-unprivileged compiled-in paths point to
# /var/cache/nginx/* and nginx tries to chown them at startup.
# On a read-only rootfs with tmpfs mounts, the directories must
# be chown'd before nginx starts (tmpfs mounts are root:root by default).

for dir in /var/cache/nginx /var/log/nginx /tmp /var/run; do
    mkdir -p "$dir"
    chown -R 101:101 "$dir" 2>/dev/null || true
done

# Drop to nginx user and run the standard entrypoint.
# su-exec is simpler than su and does not require SETGID capability.
exec su-exec nginx /docker-entrypoint.sh nginx -g "daemon off;"
