#!/usr/bin/env bash
# =============================================================================
# Aaple Shasan — Dev Quick Start (no Docker needed)
# Starts backend + frontend in development mode with hot reload
# =============================================================================
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}  🏛️  Aaple Shasan — Development Mode${NC}"
echo "  ======================================"
echo ""

# Check Node
node_version=$(node -v 2>/dev/null | cut -c2- | cut -d. -f1)
if [ -z "$node_version" ] || [ "$node_version" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Install from https://nodejs.org"
  exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v) detected${NC}"

# Setup .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${YELLOW}⚠️  .env created from .env.example. Edit DATABASE_URL, REDIS_URL, JWT secrets.${NC}"
fi

# Install backend deps
if [ ! -d backend/node_modules ]; then
  echo "📦 Installing backend dependencies..."
  cd backend && npm install && cd ..
fi

# Install frontend deps
if [ ! -d frontend/node_modules ]; then
  echo "📦 Installing frontend dependencies..."
  cd frontend && npm install && cd ..
fi

# Check if postgres is running locally
if ! pg_isready -q 2>/dev/null; then
  echo -e "${YELLOW}⚠️  PostgreSQL not found locally. Starting via Docker...${NC}"
  docker-compose up -d postgres redis
  sleep 3
fi

echo ""
echo "🚀 Starting development servers..."
echo "   Backend:  http://localhost:5000"
echo "   Frontend: http://localhost:3000"
echo ""
echo "   Press Ctrl+C to stop both servers."
echo ""

# Start both with concurrently if available, else use & and wait
if command -v concurrently >/dev/null 2>&1; then
  concurrently \
    --names "API,WEB" \
    --prefix-colors "blue,green" \
    "cd backend && npm run dev" \
    "cd frontend && npm run dev"
else
  # Fallback: background processes
  cd backend && npm run dev &
  BACKEND_PID=$!
  cd ../frontend && npm run dev &
  FRONTEND_PID=$!
  echo "Backend PID: $BACKEND_PID | Frontend PID: $FRONTEND_PID"
  trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Servers stopped.'" EXIT
  wait
fi
