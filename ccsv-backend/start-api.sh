#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE=${CCSV_ENV_FILE:-/volume1/ccsv-private/ccsv-api.env}
LOG_FILE="$SCRIPT_DIR/ccsv-api-start.log"

exec >> "$LOG_FILE" 2>&1
echo "=== CCSV API startup: $(date) ==="
echo "Backend directory: $SCRIPT_DIR"
echo "Database config file: $ENV_FILE"

# =====================================================================
# NEW: Find and terminate the old running API instance before continuing
# =====================================================================
echo "Checking for old running instances of server.js..."
# Find PIDs matching 'node server.js' that belong to the current directory, excluding this script
OLD_PIDS=$(pgrep -f "server.js" | grep -v "$$" || true)

if [ -n "$OLD_PIDS" ]; then
    echo "Found old API running process(es): $OLD_PIDS. Terminating..."
    kill -9 $OLD_PIDS 2>/dev/null || true
    sleep 2
else
    echo "No old instance found. Proceeding normally."
fi
# =====================================================================

if [ ! -r "$ENV_FILE" ]; then
    echo "Cannot read database configuration file: $ENV_FILE" >&2
    exit 1
fi

ENV_TEMP="/tmp/ccsv-api-env.$$"
umask 077
tr -d '\r' < "$ENV_FILE" > "$ENV_TEMP"

while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
        ''|\#*) continue ;;
        *=*) ;;
        *) echo "Ignoring invalid database config line." >&2; continue ;;
    esac

    key=${line%%=*}
    value=${line#*=}
    case "$key" in
        DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME|BASIC_SETTINGS_KEY) ;;
        *) continue ;;
    esac

    case "$value" in
        \"*\") value=${value#\"}; value=${value%\"} ;;
        \'*\') value=${value#\'}; value=${value%\'} ;;
    esac
    export "$key=$value"
done < "$ENV_TEMP"

rm -f "$ENV_TEMP"

: "${DB_HOST:?Missing DB_HOST in .env}"
: "${DB_PORT:?Missing DB_PORT in .env}"
: "${DB_USER:?Missing DB_USER in .env}"
: "${DB_PASSWORD:?Missing DB_PASSWORD in .env}"
: "${DB_NAME:?Missing DB_NAME in .env}"

echo "MariaDB target: $DB_HOST:$DB_PORT"

NODE_BIN=
for candidate in /var/packages/Node.js*/target/usr/local/bin/node; do
    [ -x "$candidate" ] || continue
    node_major=$("$candidate" -p 'Number(process.versions.node.split(".")[0])')
    if [ "$node_major" -ge 12 ]; then
        NODE_BIN=$candidate
        break
    fi
done

if [ -z "$NODE_BIN" ]; then
    echo "Node.js package candidates:"
    found_node=0
    for candidate in /var/packages/Node.js*/target/usr/local/bin/node /var/packages/Node.js*/target/bin/node /usr/local/bin/node /usr/bin/node; do
        [ -x "$candidate" ] || continue
        found_node=1
        echo "$candidate ($("$candidate" --version 2>&1))"
    done
    if [ "$found_node" -eq 0 ]; then
        echo "No Node.js executable found in the checked paths."
        if command -v node >/dev/null 2>&1; then
            echo "Node.js on PATH: $(command -v node) ($(node --version 2>&1))"
        else
            echo "No node command is available on the task PATH."
        fi
    fi
    echo "Node.js 12 or newer was not found in /var/packages." >&2
    exit 1
fi

echo "Using Node.js: $NODE_BIN ($("$NODE_BIN" --version))"
cd "$SCRIPT_DIR"
exec "$NODE_BIN" server.js