#!/bin/sh
set -e

# If /app/html is mounted and is empty, copy default frontend files
if [ -d "/app/html" ] && [ -z "$(ls -A /app/html 2>/dev/null)" ]; then
    echo "Initializing /app/html with default frontend files..."
    cp -a /app/frontend/* /app/html/ 2>/dev/null || echo "Warning: Could not copy default files to /app/html. Check directory permissions."
fi

exec "$@"
