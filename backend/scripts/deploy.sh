#!/usr/bin/env bash
# =============================================================================
# Aaple Shasan — Production Deployment Script
# Government of Maharashtra · Civic Platform
# =============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
success(){ echo -e "${GREEN}✅ $1${NC}"; }
warn()   { echo -e "${YELLOW}⚠️  $1${NC}"; }
error()  { echo -e "${RED}❌ $1${NC}"; exit 1; }

echo ""
echo "  🏛️  Aaple Shasan — Production Deployment"
echo "  ==========================================="
echo ""

# Check prerequisites
log "Checking prerequisites..."
command -v docker >/dev/null 2>&1 || error "Docker is not installed"
command -v docker-compose >/dev/null 2>&1 || error "docker-compose is not installed"
success "Docker and docker-compose found"

# Check .env exists
if [ ! -f .env ]; then
  warn ".env not found — creating from .env.example"
  cp .env.example .env
  error "Please edit .env with your production values before deploying"
fi

# Validate critical env vars
log "Validating environment..."
required_vars=(
  "POSTGRES_PASSWORD"
  "REDIS_PASSWORD"
  "JWT_ACCESS_SECRET"
  "JWT_REFRESH_SECRET"
  "SESSION_SECRET"
)
for var in "${required_vars[@]}"; do
  value=$(grep "^${var}=" .env | cut -d '=' -f2-)
  if [ -z "$value" ] || [ "$value" = "CHANGE_ME_"* ]; then
    error "$var must be set to a real secret in .env"
  fi
done
success "All required environment variables set"

# Create SSL directory if it doesn't exist (self-signed for testing)
if [ ! -f nginx/ssl/cert.pem ]; then
  log "Generating self-signed SSL certificate (replace with real cert in production)..."
  mkdir -p nginx/ssl
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/ssl/key.pem \
    -out nginx/ssl/cert.pem \
    -subj "/C=IN/ST=Maharashtra/L=Mumbai/O=Govt of Maharashtra/CN=aapleshasan.maharashtra.gov.in" \
    2>/dev/null
  success "SSL certificate generated (self-signed)"
fi

# Pull latest images
log "Pulling latest base images..."
docker pull postgres:16-alpine
docker pull redis:7-alpine
docker pull node:20-alpine
docker pull nginx:alpine
success "Base images pulled"

# Build images
log "Building application images..."
docker-compose build --no-cache --parallel
success "Application images built"

# Stop existing containers gracefully
if docker-compose ps | grep -q "Up"; then
  log "Stopping existing containers..."
  docker-compose stop --timeout 15
  success "Existing containers stopped"
fi

# Start database first and wait
log "Starting database services..."
docker-compose up -d postgres redis
log "Waiting for PostgreSQL to be healthy..."
timeout=60
while ! docker-compose exec -T postgres pg_isready -U "${POSTGRES_USER:-aapleshasan_user}" -q; do
  timeout=$((timeout-2))
  if [ $timeout -le 0 ]; then
    error "PostgreSQL failed to start within 60 seconds"
  fi
  sleep 2
done
success "PostgreSQL is healthy"

log "Waiting for Redis to be healthy..."
timeout=30
while ! docker-compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" ping | grep -q PONG; do
  timeout=$((timeout-2))
  if [ $timeout -le 0 ]; then
    error "Redis failed to start within 30 seconds"
  fi
  sleep 2
done
success "Redis is healthy"

# Start remaining services
log "Starting API and frontend..."
docker-compose up -d backend frontend nginx
log "Waiting for API to be healthy..."
timeout=60
while ! curl -sf http://localhost:5000/api/health >/dev/null; do
  timeout=$((timeout-2))
  if [ $timeout -le 0 ]; then
    error "API failed health check within 60 seconds"
    docker-compose logs backend | tail -30
  fi
  sleep 2
done
success "API is healthy"

# Run health checks
log "Running final health checks..."
api_health=$(curl -sf http://localhost:5000/api/health)
if echo "$api_health" | grep -q '"status":"ok"'; then
  success "API health check passed"
else
  error "API health check failed: $api_health"
fi

# Display status
echo ""
echo "  =============================================="
success "Deployment complete!"
echo ""
echo "  Services:"
echo "    Frontend:  http://localhost (via Nginx)"
echo "    API:       http://localhost/api"
echo "    Health:    http://localhost/api/health"
echo ""
echo "  Default credentials (CHANGE IMMEDIATELY):"
echo "    Phone:    9000000000"
echo "    Password: Admin@123"
echo ""
docker-compose ps
echo ""
