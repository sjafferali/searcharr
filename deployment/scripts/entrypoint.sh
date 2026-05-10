#!/bin/sh
set -e

echo "Starting Searcharr..."

# Create necessary directories
mkdir -p /app/logs

# Database initialization based on type
if [ "$DATABASE_TYPE" = "postgresql" ]; then
    echo "Using PostgreSQL database"

    # Wait for PostgreSQL to be ready
    if [ -n "$POSTGRES_HOST" ] && [ -n "$POSTGRES_PORT" ]; then
        echo "Waiting for PostgreSQL to be ready..."
        # Try different methods to check PostgreSQL connectivity
        if command -v nc >/dev/null 2>&1; then
            while ! nc -z "$POSTGRES_HOST" "$POSTGRES_PORT"; do
                echo "PostgreSQL is unavailable - sleeping"
                sleep 1
            done
        elif command -v python3 >/dev/null 2>&1; then
            while ! python3 -c "import socket; socket.create_connection(('$POSTGRES_HOST', $POSTGRES_PORT), 1).close()" 2>/dev/null; do
                echo "PostgreSQL is unavailable - sleeping"
                sleep 1
            done
        else
            # Just wait a fixed time if no connectivity check is available
            echo "No connectivity check available, waiting 10 seconds..."
            sleep 10
        fi
        echo "PostgreSQL is up!"
    fi
else
    echo "Using SQLite database"
    # Ensure SQLite database file exists
    if [ -n "$SQLITE_DATABASE_PATH" ]; then
        touch "$SQLITE_DATABASE_PATH"
    fi
fi

# Run database migrations
echo "Running database migrations..."
cd /app/backend

# Ensure versions directory exists
mkdir -p alembic/versions

# Create initial migration if none exist
if [ -z "$(ls -A alembic/versions/*.py 2>/dev/null)" ]; then
    echo "Creating initial migration..."
    alembic revision --autogenerate -m "Initial migration" || true
fi

# Run migrations. ``set -e`` at the top of this script means a failed
# upgrade aborts container startup — the application owns no schema
# fallback, so a broken DB must be fixed (or the migration debugged)
# before the app can serve traffic.
echo "Applying database migrations..."
alembic upgrade head

# Start supervisord
echo "Starting application services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
