#!/bin/sh

set -eu

ensure_writable_dir() {
    dir="$1"
    label="$2"

    mkdir -p "$dir"

    if [ ! -w "$dir" ]; then
        echo "Error: ${label} directory '$dir' is not writable by UID $(id -u)." >&2
        echo "Please update the host volume permissions for the mapped path and restart the container." >&2
        exit 1
    fi
}

ensure_writable_dir "/app/data" "Data"
ensure_writable_dir "/app/html" "Frontend"

# Check if the mapped directory is empty by looking for index.html
if [ ! -f "/app/html/index.html" ]; then
    echo "First run detected. Populating /app/html with frontend files..."
    cp -R /app/html-seed/. /app/html/
    echo "Files copied successfully."
else
    echo "Existing frontend files detected in /app/html. Skipping copy."
fi

# Hand over control to the Node application
exec "$@"
