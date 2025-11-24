#!/bin/bash

# ===========================================
# Complete Authentication Flow Test
# ===========================================
# Tests HTTP login → Get ticket → WebSocket connect
#
# Usage: ./test-auth-flow.sh

set -e  # Exit on error

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8082}"
TEST_EMAIL="${TEST_EMAIL:-buyer1@nimon.com}"
TEST_PASSWORD="${TEST_PASSWORD:-nimon}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions
log() {
    echo -e "${CYAN}[TEST]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
    exit 1
}

info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Create temp directory for test files
TEMP_DIR=$(mktemp -d)
COOKIE_FILE="$TEMP_DIR/cookies.txt"
RESPONSE_FILE="$TEMP_DIR/response.json"

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# ============================================
# Main Test Flow
# ============================================

echo ""
echo "╔════════════════════════════════════════╗"
echo "║  Authentication Flow Integration Test  ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Step 1: Test backend health
step "Step 1: Testing Backend Services"

log "Checking PHP backend..."
if curl -s -f "$BASE_URL/api/check_session.php" > /dev/null; then
    success "PHP backend is up"
else
    error "PHP backend is down or unreachable"
fi

log "Checking Node.js backend..."
NODE_RESPONSE=$(curl -s "$BASE_URL/api/node/health")
if echo "$NODE_RESPONSE" | grep -q "ok"; then
    success "Node.js backend is up"
else
    error "Node.js backend is down or unreachable"
fi

# Step 2: Login via HTTP
step "Step 2: HTTP Login"

log "Logging in as $TEST_EMAIL..."
LOGIN_RESPONSE=$(curl -s -c "$COOKIE_FILE" \
    -X POST "$BASE_URL/api/login.php" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
    -w "\n%{http_code}")

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -eq 200 ]; then
    success "Login successful"
    info "Response: $LOGIN_BODY"
else
    error "Login failed with HTTP $HTTP_CODE"
fi

# Verify session cookie was set
if [ ! -f "$COOKIE_FILE" ] || ! grep -q "PHPSESSID" "$COOKIE_FILE"; then
    error "No session cookie received"
fi

SESSION_COOKIE=$(grep PHPSESSID "$COOKIE_FILE" | cut -f7)
success "Session cookie: PHPSESSID=$SESSION_COOKIE"

# Step 3: Verify session
step "Step 3: Verify Session"

log "Checking session validity..."
SESSION_CHECK=$(curl -s -b "$COOKIE_FILE" "$BASE_URL/api/check_session.php")

USER_ID=$(echo "$SESSION_CHECK" | grep -o '"user_id":[0-9]*' | cut -d: -f2)
ROLE=$(echo "$SESSION_CHECK" | grep -o '"role":"[^"]*"' | cut -d'"' -f4)

if [ -n "$USER_ID" ] && [ "$USER_ID" != "not set" ]; then
    success "Session is valid"
    info "User ID: $USER_ID"
    info "Role: $ROLE"
else
    error "Session is invalid"
fi

# Step 4: Generate WebSocket ticket
step "Step 4: Generate WebSocket Ticket"

log "Requesting WebSocket ticket..."
TICKET_RESPONSE=$(curl -s -b "$COOKIE_FILE" "$BASE_URL/api/generate_ws_ticket.php")

echo "$TICKET_RESPONSE" > "$RESPONSE_FILE"

if echo "$TICKET_RESPONSE" | grep -q '"success":true'; then
    TICKET=$(echo "$TICKET_RESPONSE" | grep -o '"ticket":"[^"]*"' | cut -d'"' -f4)
    EXPIRES=$(echo "$TICKET_RESPONSE" | grep -o '"expires_at":"[^"]*"' | cut -d'"' -f4)
    
    success "Ticket generated"
    info "Ticket: ${TICKET:0:30}..."
    info "Expires: $EXPIRES"
    
    # Export for use in other scripts
    export WS_TICKET="$TICKET"
    export WS_USER_ID="$USER_ID"
else
    error "Failed to generate ticket: $TICKET_RESPONSE"
fi

# Step 5: Validate ticket in database (if possible)
step "Step 5: Validate Ticket (Optional)"

info "To verify ticket in database, run:"
echo "  docker exec -it <postgres-container> psql -U user -d nimonspedia -c \\"
echo "    \"SELECT user_id, used, expires_at FROM ws_tickets WHERE ticket = '$TICKET';\""

# Step 6: Instructions for WebSocket test
step "Step 6: Test WebSocket Connection"

info "Ticket is ready! Now test WebSocket connection:"
echo ""
echo "Option A - Using Node.js test client:"
echo "  export TEST_SESSION_COOKIE=\"PHPSESSID=$SESSION_COOKIE\""
echo "  node test-ws-client.js"
echo ""
echo "Option B - Using wscat:"
echo "  # After connecting, send:"
echo "  {\"type\":\"authenticate\",\"ticket\":\"$TICKET\"}"
echo ""

# Step 7: Summary
step "Summary"

echo "Authentication Flow Test Results:"
echo ""
echo "  ✅ Backend services: HEALTHY"
echo "  ✅ HTTP Login: SUCCESS"
echo "  ✅ Session created: PHPSESSID=$SESSION_COOKIE"
echo "  ✅ User authenticated: ID=$USER_ID, Role=$ROLE"
echo "  ✅ WebSocket ticket: GENERATED"
echo "  ⏰ Ticket valid until: $EXPIRES"
echo ""

success "All HTTP authentication steps completed successfully!"
info "Run WebSocket test to complete end-to-end verification"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║           Test Complete! ✅            ║"
echo "╚════════════════════════════════════════╝"
echo ""