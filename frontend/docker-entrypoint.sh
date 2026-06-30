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

# Run nginx directly as root. The nginx master process stays root but
# worker processes automatically drop to the configured user (nginx/uid 101).
# This avoids needing SETUID/SETGID capabilities for su-exec.
exec nginx -g "daemon off;"
