#!/bin/bash

# ===========================================
# WebSocket Testing with wscat
# ===========================================
# This script provides examples for testing WebSocket
# connections using wscat (WebSocket CLI client)
#
# Install: npm install -g wscat
#
# Usage: ./test-wscat.sh

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║  WebSocket Testing with wscat - Quick Guide  ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Check if wscat is installed
if ! command -v wscat &> /dev/null; then
    echo -e "${YELLOW}⚠️  wscat is not installed${NC}"
    echo ""
    echo "Install with:"
    echo "  npm install -g wscat"
    echo ""
    echo "Or use npx:"
    echo "  npx wscat -c ws://localhost:8082/socket.io/"
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ wscat is installed${NC}"
echo ""

# ============================================
# Example 1: Basic Connection Test
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Example 1: Basic WebSocket Connection${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${CYAN}Command:${NC}"
echo "wscat -c ws://localhost:8082/socket.io/?EIO=4&transport=websocket"
echo ""

echo -e "${YELLOW}Note: Socket.io uses a specific protocol. For raw WebSocket, use /ws endpoint if available.${NC}"
echo ""

# ============================================
# Example 2: Connect to Chat Namespace
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Example 2: Connect to Chat Namespace${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${CYAN}Step 1: Get WebSocket ticket${NC}"
echo "Run: ./test-auth-flow.sh"
echo "Copy the ticket from output"
echo ""

echo -e "${CYAN}Step 2: Connect with wscat${NC}"
echo "wscat -c 'ws://localhost:8082/socket.io/?EIO=4&transport=websocket&path=/chat'"
echo ""

echo -e "${CYAN}Step 3: Authenticate${NC}"
echo "After connection, send:"
echo '42["authenticate",{"ticket":"YOUR_TICKET_HERE"}]'
echo ""

echo -e "${CYAN}Expected response:${NC}"
echo '42["authenticated",{"userId":1}]'
echo ""

# ============================================
# Example 3: Join Room and Send Message
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Example 3: Full Chat Flow${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${CYAN}Message sequence:${NC}"
echo ""

echo "1. Authenticate:"
echo '   42["authenticate",{"ticket":"a4cc9cb805..."}]'
echo ""

echo "2. Join room:"
echo '   42["join-room",{"roomId":1}]'
echo ""

echo "3. Send message:"
echo '   42["send-message",{"message":"Hello from wscat!"}]'
echo ""

echo "4. Typing indicator:"
echo '   42["typing",{}]'
echo ""

echo "5. Stop typing:"
echo '   42["stop-typing",{}]'
echo ""

# ============================================
# Example 4: Using websocat (Alternative)
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Alternative: Using websocat${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}websocat is more flexible for raw WebSocket testing${NC}"
echo ""

echo "Install:"
echo "  cargo install websocat"
echo "  # or"
echo "  brew install websocat"
echo ""

echo "Usage:"
echo '  echo '\''42["authenticate",{"ticket":"a4cc..."}]'\'' | \'
echo '    websocat ws://localhost:8082/socket.io/?EIO=4&transport=websocket'
echo ""

# ============================================
# Example 5: Automated Test Script
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Example 5: Automated Testing${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${CYAN}For automated testing, use Node.js client instead:${NC}"
echo "  node test-ws-client.js"
echo ""

echo -e "${YELLOW}Reason: wscat is interactive, Node.js is better for CI/CD${NC}"
echo ""

# ============================================
# Socket.io Protocol Notes
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Socket.io Protocol Notes${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Socket.io uses Engine.IO protocol with packet prefixes:"
echo ""
echo "  0  - OPEN"
echo "  1  - CLOSE"
echo "  2  - PING"
echo "  3  - PONG"
echo "  4  - MESSAGE"
echo "  40 - CONNECT"
echo "  41 - DISCONNECT"
echo "  42 - EVENT"
echo "  43 - ACK"
echo "  44 - ERROR"
echo ""

echo "Event format:"
echo '  42["event_name",{data}]'
echo "      ││ │           │"
echo "      ││ │           └─ Event data (JSON)"
echo "      ││ └───────────── Event name"
echo "      │└──────────────── Array indicator"
echo "      └───────────────── MESSAGE + EVENT"
echo ""

# ============================================
# Troubleshooting
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Troubleshooting${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "❌ Connection refused:"
echo "   → Check if Node.js server is running: docker compose ps"
echo "   → Check if port 8082 is accessible: curl localhost:8082"
echo ""

echo "❌ Auth error:"
echo "   → Ensure ticket is valid and not expired (5 min)"
echo "   → Get new ticket: curl http://localhost:8082/api/generate_ws_ticket.php -b cookies.txt"
echo ""

echo "❌ Messages not appearing:"
echo "   → Check if you joined a room first"
echo "   → Verify authentication succeeded"
echo "   → Check Node.js logs: docker compose logs nodejs"
echo ""

# ============================================
# Quick Reference
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Quick Reference${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo "Test complete flow:"
echo "  1. ./test-auth-flow.sh          # Get ticket"
echo "  2. node test-ws-client.js       # Test with automation"
echo ""

echo "Manual testing:"
echo "  1. Get ticket → ./test-auth-flow.sh"
echo "  2. Connect → wscat -c 'ws://localhost:8082/socket.io/?EIO=4&transport=websocket'"
echo '  3. Auth → 42["authenticate",{"ticket":"..."}]'
echo '  4. Join → 42["join-room",{"roomId":1}]'
echo '  5. Send → 42["send-message",{"message":"test"}]'
echo ""

echo "Debug:"
echo "  docker compose logs -f nodejs    # Watch logs"
echo "  docker compose restart nodejs    # Restart server"
echo ""

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Ready to test! 🚀${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""