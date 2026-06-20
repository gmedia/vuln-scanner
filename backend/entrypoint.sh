#!/bin/sh
set -e

# Run pre-startup validation
/app/prestart.sh

# Execute the main command (passed via CMD or overridden)
exec "$@"
