#!/usr/bin/env node

/**
 * WebSocket Chat Test Client
 * Tests the complete authentication and chat flow
 * 
 * Usage:
 *   export TEST_SESSION_COOKIE="PHPSESSID=abc123..."
 *   node test-ws-client.js
 */

const io = require('socket.io-client');
const fetch = require('node-fetch');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:8082';
const SESSION_COOKIE = process.env.TEST_SESSION_COOKIE;

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(emoji, message, color = 'reset') {
  console.log(`${colors[color]}${emoji} ${message}${colors.reset}`);
}

function error(message) {
  log('❌', message, 'red');
  process.exit(1);
}

// Test state
const testState = {
  startTime: Date.now(),
  steps: [],
  socket: null,
  authenticated: false,
  roomJoined: false
};

async function testComplete() {
  const duration = ((Date.now() - testState.startTime) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(50));
  log('🎉', 'All tests passed!', 'green');
  log('⏱️', `Duration: ${duration}s`, 'cyan');
  console.log('='.repeat(50) + '\n');
  
  console.log('Steps completed:');
  testState.steps.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step}`);
  });
  
  if (testState.socket) {
    testState.socket.disconnect();
  }
  
  process.exit(0);
}

async function step(description, action) {
  log('🔹', description, 'blue');
  try {
    await action();
    testState.steps.push(description);
    log('✅', 'Success\n', 'green');
  } catch (err) {
    error(`Failed: ${err.message}`);
  }
}

async function testChat() {
  console.log('\n' + '='.repeat(50));
  log('🧪', 'WebSocket Chat Test Suite', 'cyan');
  console.log('='.repeat(50) + '\n');

  // Validate prerequisites
  if (!SESSION_COOKIE) {
    error('TEST_SESSION_COOKIE not set. Login first and export the cookie.');
  }

  // Step 1: Get WebSocket ticket
  await step('Getting WebSocket ticket from PHP', async () => {
    const response = await fetch(`${BASE_URL}/api/generate_ws_ticket.php`, {
      headers: {
        'Cookie': SESSION_COOKIE
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to get ticket');
    }

    testState.ticket = data.ticket;
    testState.expiresAt = new Date(data.expires_at);
    
    log('🎫', `Ticket: ${testState.ticket.substring(0, 20)}...`, 'yellow');
    log('⏰', `Expires: ${testState.expiresAt.toLocaleTimeString()}`, 'yellow');
  });

  // Step 2: Connect to WebSocket
  await step('Connecting to WebSocket server', () => {
    return new Promise((resolve, reject) => {
      const socket = io(`${BASE_URL}/chat`, {
        transports: ['websocket', 'polling'],
        reconnection: false // Disable auto-reconnect for testing
      });

      testState.socket = socket;

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout (10s)'));
      }, 10000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        log('🔌', `Socket ID: ${socket.id}`, 'yellow');
        resolve();
      });

      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Connection error: ${err.message}`));
      });
    });
  });

  // Step 3: Authenticate
  await step('Authenticating with ticket', () => {
    return new Promise((resolve, reject) => {
      const socket = testState.socket;
      
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout (5s)'));
      }, 5000);

      socket.once('authenticated', (data) => {
        clearTimeout(timeout);
        testState.authenticated = true;
        testState.userId = data.userId;
        log('👤', `User ID: ${testState.userId}`, 'yellow');
        resolve();
      });

      socket.once('auth-error', (data) => {
        clearTimeout(timeout);
        reject(new Error(`Auth failed: ${data.message}`));
      });

      // Send authentication
      socket.emit('authenticate', { ticket: testState.ticket });
    });
  });

  // Step 4: Join chat room
  await step('Joining chat room #1', () => {
    return new Promise((resolve, reject) => {
      const socket = testState.socket;
      
      const timeout = setTimeout(() => {
        reject(new Error('Join room timeout (5s)'));
      }, 5000);

      socket.once('room-joined', (data) => {
        clearTimeout(timeout);
        testState.roomJoined = true;
        testState.roomId = data.roomId;
        testState.messageHistory = data.messages;
        log('💬', `Room ID: ${data.roomId}`, 'yellow');
        log('📜', `Message history: ${data.messages.length} messages`, 'yellow');
        resolve();
      });

      socket.once('error', (data) => {
        clearTimeout(timeout);
        reject(new Error(`Join failed: ${data.message}`));
      });

      // Join room
      socket.emit('join-room', { roomId: 1 });
    });
  });

  // Step 5: Send test message
  await step('Sending test message', () => {
    return new Promise((resolve, reject) => {
      const socket = testState.socket;
      const testMessage = `Test message from automated client at ${new Date().toISOString()}`;
      
      const timeout = setTimeout(() => {
        reject(new Error('Send message timeout (5s)'));
      }, 5000);

      socket.once('new-message', (data) => {
        clearTimeout(timeout);
        
        if (data.message === testMessage && data.sender_id === testState.userId) {
          log('📨', `Message ID: ${data.id}`, 'yellow');
          log('💬', `Content: "${data.message}"`, 'yellow');
          resolve();
        } else {
          // Another user's message, wait for ours
          socket.once('new-message', (data2) => {
            clearTimeout(timeout);
            log('📨', `Message ID: ${data2.id}`, 'yellow');
            log('💬', `Content: "${data2.message}"`, 'yellow');
            resolve();
          });
        }
      });

      socket.once('error', (data) => {
        clearTimeout(timeout);
        reject(new Error(`Send failed: ${data.message}`));
      });

      // Send message
      socket.emit('send-message', { message: testMessage });
    });
  });

  // Step 6: Test typing indicator
  await step('Testing typing indicator', () => {
    return new Promise((resolve) => {
      const socket = testState.socket;
      
      // Listen for our own typing echo (if implemented)
      socket.once('user-typing', (data) => {
        log('⌨️', `User ${data.userId} is typing`, 'yellow');
      });

      // Emit typing
      socket.emit('typing');
      
      // Wait a bit then stop typing
      setTimeout(() => {
        socket.emit('stop-typing');
        resolve();
      }, 1000);
    });
  });

  // All tests passed!
  await testComplete();
}

// Error handling
process.on('unhandledRejection', (err) => {
  error(`Unhandled error: ${err.message}`);
});

process.on('SIGINT', () => {
  console.log('\n\n' + '='.repeat(50));
  log('🛑', 'Test interrupted by user', 'yellow');
  console.log('='.repeat(50) + '\n');
  
  if (testState.socket) {
    testState.socket.disconnect();
  }
  
  process.exit(130);
});

// Run tests
testChat().catch((err) => {
  error(`Test suite failed: ${err.message}`);
});