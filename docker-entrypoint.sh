#!/bin/sh
set -e

echo "🚀 Waiting for SQL Server to be ready..."

RETRIES=30
COUNT=0
while [ $COUNT -lt $RETRIES ]; do
  node ./scripts/init-db.js && break
  COUNT=$((COUNT + 1))
  echo "Waiting for SQL Server... ($COUNT/$RETRIES)"
  sleep 3
done

if [ $COUNT -ge $RETRIES ]; then
  echo "SQL Server did not become ready in time. Exiting."
  exit 1
fi

echo "✅ Database initialized. Starting HackNest..."
npm start
