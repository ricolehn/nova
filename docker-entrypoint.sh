#!/bin/sh

set -eu

data_dir="${DATA_DIR:-/app/data}"
frontend_dir="${FRONTEND_DIR:-/app/html}"
frontend_seed_dir="${FRONTEND_SEED_DIR:-/app/html-seed}"
runtime_user="${RUNTIME_USER:-node}"

# BusyBox `su -c` treats the first argument after the command string as $0,
# so we pass a placeholder before the real arguments that the nested shell uses.
run_shell_as_runtime_user() {
    shell_command="$1"
    shift

    if [ "$(id -u)" -eq 0 ]; then
        current_dir=$(pwd)
        # BusyBox `su -c` consumes the first post-command argument as $0.
        su "$runtime_user" -s /bin/sh -c 'cd "$1" && shift && command="$1" && shift && exec sh -c "$command" runtime-sh "$@"' -- su-placeholder "$current_dir" "$shell_command" "$@"
        return
    fi

    sh -c "$shell_command" runtime-sh "$@"
}

# Preserve the current working directory so relative CMD paths like
# `node backend/server.js` still resolve after dropping privileges.
run_as_runtime_user() {
    if [ "$(id -u)" -eq 0 ]; then
        current_dir=$(pwd)
        # Keep a placeholder for $0 so the preserved working directory stays in $1.
        su "$runtime_user" -s /bin/sh -c 'cd "$1" && shift && exec "$@"' -- su-placeholder "$current_dir" "$@"
        return
    fi

    exec "$@"
}

runtime_user_can_write_dir() {
    dir="$1"
    run_shell_as_runtime_user 'test -w "$1"' "$dir"
}

ensure_writable_dir() {
    dir="$1"
    label="$2"

    mkdir -p "$dir"

    if [ "$(id -u)" -eq 0 ]; then
        if ! chown "$runtime_user":"$runtime_user" "$dir"; then
            echo "Error: ${label} directory '$dir' could not be assigned to ${runtime_user}." >&2
            echo "Please update the host volume permissions for the mapped path and restart the container." >&2
            exit 1
        fi
    fi

    if ! runtime_user_can_write_dir "$dir"; then
        echo "Error: ${label} directory '$dir' is not writable by runtime user '${runtime_user}'." >&2
        echo "Please update the host volume permissions for the mapped path and restart the container." >&2
        exit 1
    fi
}

ensure_writable_dir "$data_dir" "Data"
ensure_writable_dir "$frontend_dir" "Frontend"

# Always sync bundled frontend files into the (possibly mounted) frontend
# directory so that image upgrades take effect without removing the volume.
if [ ! -f "$frontend_dir/index.html" ]; then
    echo "First run detected. Populating $frontend_dir with frontend files..."
else
    echo "Updating frontend files in $frontend_dir from bundled seed..."
fi

# Copy files directly as root to avoid BusyBox su limitations.
# Existing files are overwritten; user data lives in $data_dir, not here.
cp -R "$frontend_seed_dir"/. "$frontend_dir"

# Immediately hand ownership to the runtime user
if [ "$(id -u)" -eq 0 ]; then
    chown -R "$runtime_user":"$runtime_user" "$frontend_dir"
fi

echo "Frontend files synced successfully."

# Hand over control to the Node application
run_as_runtime_user "$@"
