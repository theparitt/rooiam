#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Rooiam frontend stack..."

# Start rooiam-admin (admin dashboard)
echo "Starting rooiam-admin on port 5171..."
(cd "$SCRIPT_DIR/rooiam-admin" && npm run dev -- --port 5171 &)

# Start rooiam-app (tenant login portal)
echo "Starting rooiam-app on port 5172..."
(cd "$SCRIPT_DIR/rooiam-app" && npm run dev -- --port 5172 &)

# Start rooiam-landing (public marketing site)
echo "Starting rooiam-landing on port 5173..."
(cd "$SCRIPT_DIR/rooiam-landing" && npm run dev -- --port 5173 &)

# Start candycloud-web (demo downstream app)
echo "Starting candycloud-web on port 5184..."
(cd "$SCRIPT_DIR/candycloud-web" && npm run dev:demo &)

echo ""
echo "Rooiam frontend stack started:"
echo "  - Admin Dashboard:  http://localhost:5171"
echo "  - Tenant Login:      http://localhost:5172"
echo "  - Landing Page:      http://localhost:5173"
echo "  - Demo App:          http://localhost:5184"
echo ""
echo "Press Ctrl+C to stop all services"

wait
