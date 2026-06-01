#!/bin/sh

attempt=1
max_attempts=30

if [ -z "$ROOIAM_DATABASE_URL" ]; then
  echo "ROOIAM_DATABASE_URL is required."
  exit 1
fi

while [ "$attempt" -le "$max_attempts" ]; do
  echo "Running migrations (attempt $attempt/$max_attempts)..."
  if sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"; then
    break
  fi

  if [ "$attempt" -eq "$max_attempts" ]; then
    echo "Migration failed after $max_attempts attempts."
    exit 1
  fi

  attempt=$((attempt + 1))
  sleep 2
done

exec /usr/local/bin/rooiam-server

