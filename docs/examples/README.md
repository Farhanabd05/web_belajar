# Nimonspedia M2 - Test Examples

This directory contains test clients, scripts, and examples for verifying your M2 setup.

## 📁 Files

| File | Purpose | Usage |
|------|---------|-------|
| `.env.example` | Environment template | Copy to `../nodejs/.env` |
| `package.json` | Dependencies for test clients | `npm install` |
| `test-auth-flow.sh` | HTTP authentication test | `./test-auth-flow.sh` |
| `test-ws-client.js` | Automated WebSocket test | `node test-ws-client.js` |
| `test-wscat.sh` | Manual WebSocket testing guide | `./test-wscat.sh` |

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd examples
npm install
```

### 2. Run Complete Test Suite

```bash
# Test HTTP auth + WebSocket in one command
npm run test:all
```

## 📋 Individual Tests

### Test 1: HTTP Authentication Flow

Tests login → session → ticket generation.

```bash
./test-auth-flow.sh
```

**What it tests:**
- ✅ Backend services are running
- ✅ PHP login works
- ✅ Session cookie is set
- ✅ Session is valid
- ✅ WebSocket ticket can be generated

**Output example:**
```
╔════════════════════════════════════════╗
║  Authentication Flow Integration Test  ║
╚════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: Testing Backend Services
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[TEST] Checking PHP backend...
✅ PHP backend is up
[TEST] Checking Node.js backend...
✅ Node.js backend is up

...

✅ All HTTP authentication steps completed successfully!
```

---

### Test 2: WebSocket Connection

Tests full WebSocket flow: connect → authenticate → join room → send message.

```bash
# First, get session cookie from test-auth-flow.sh or login manually
export TEST_SESSION_COOKIE="PHPSESSID=abc123..."

# Run test
node test-ws-client.js
```

**What it tests:**
- ✅ WebSocket connection establishes
- ✅ Ticket authentication works
- ✅ Can join chat room
- ✅ Can send/receive messages
- ✅ Typing indicators work

**Output example:**
```
🧪 WebSocket Chat Test Suite
==================================================

🔹 Getting WebSocket ticket from PHP
🎫 Ticket: a4cc9cb805d92dc57...
✅ Success

🔹 Connecting to WebSocket server
🔌 Socket ID: abc123
✅ Success

🔹 Authenticating with ticket
👤 User ID: 1
✅ Success

...

🎉 All tests passed!
⏱️  Duration: 2.34s
```

---

### Test 3: Manual WebSocket Testing

Interactive guide for testing WebSocket with `wscat`.

```bash
./test-wscat.sh
```

**What it shows:**
- Installation instructions
- Connection commands
- Message format examples
- Socket.io protocol explanation
- Troubleshooting tips

**Then use wscat:**
```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c 'ws://localhost:8082/socket.io/?EIO=4&transport=websocket'

# Authenticate (after connection)
42["authenticate",{"ticket":"YOUR_TICKET"}]

# Join room
42["join-room",{"roomId":1}]

# Send message
42["send-message",{"message":"Hello!"}]
```

---

## 🔧 Environment Setup

Before running tests, configure your environment:

```bash
# Copy template
cp .env.example ../nodejs/.env

# Edit with your settings (if needed)
nano ../nodejs/.env
```

## 🐛 Troubleshooting

### Issue: "TEST_SESSION_COOKIE not set"

**Solution:**
```bash
# Option A: Run auth flow first (it exports the cookie)
./test-auth-flow.sh
node test-ws-client.js

# Option B: Login manually and export
curl -X POST http://localhost:8082/api/login.php \
  -H "Content-Type: application/json" \
  -d '{"email":"buyer1@nimon.com","password":"nimon"}' \
  -c cookies.txt

export TEST_SESSION_COOKIE="PHPSESSID=$(cat cookies.txt | grep PHPSESSID | cut -f7)"
node test-ws-client.js
```

### Issue: "Connection refused"

**Check services:**
```bash
docker compose ps
```

**Expected:** All 4 services (nginx, php, nodejs, database) should be "Up"

**Fix:**
```bash
docker compose up -d
sleep 30  # Wait for postgres to be ready
```

### Issue: "Auth error: Invalid ticket"

**Causes:**
1. Ticket expired (valid for 5 minutes)
2. Ticket already used (one-time use)

**Solution:**
Get a new ticket:
```bash
./test-auth-flow.sh  # Generates new ticket
```

### Issue: Module not found

**Solution:**
```bash
cd examples
rm -rf node_modules package-lock.json
npm install
```

---

## 📊 Test Coverage

These tests verify:

| Component | What's Tested |
|-----------|---------------|
| **PHP** | Login, session management, ticket generation |
| **Node.js** | WebSocket server, authentication, chat logic |
| **Database** | User data, ticket storage, message persistence |
| **Nginx** | Reverse proxy, WebSocket upgrade |
| **React** | (Use browser for manual testing) |

---

## 🔄 Continuous Integration

These scripts can be used in CI/CD:

```yaml
# .github/workflows/test.yml
- name: Run backend tests
  run: |
    docker compose up -d
    sleep 30
    cd examples
    npm install
    npm run test:all
```

---

## 📝 Adding New Tests

To add a new test:

1. Create `test-your-feature.js` or `test-your-feature.sh`
2. Add to `package.json` scripts:
   ```json
   "test:your-feature": "node test-your-feature.js"
   ```
3. Document in this README
4. Add to CI pipeline

---

## 💡 Tips

1. **Run auth flow first:** It sets up everything you need
2. **Watch Node.js logs:** `docker compose logs -f nodejs`
3. **Use browser DevTools:** Network tab shows WebSocket frames
4. **Test in order:** auth-flow → ws-client → manual wscat
5. **Keep ticket fresh:** Generate new one if older than 5 minutes

---

## 📞 Need Help?

If tests fail:
1. Check `docker compose logs <service>`
2. Verify all containers are running
3. Ensure ports 8082, 3001, 5432 are available
4. Try `docker compose down -v && docker compose up -d` (fresh start)

---

**Happy Testing! 🚀**