const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
const pool = require('./config/database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3001;

// Test DB connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Database connected:', res.rows[0]);
    }
});

// Middleware
app.use(express.json());

// Routes
const auctionRoutes = require('./routes/auctionRoutes');
app.use('/', auctionRoutes);

// Test endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Node.js server running' });
});

// WebSocket connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// WebSocket namespaces
const auctionNamespace = io.of('/auction');

auctionNamespace.on('connection', async (socket) => {
    console.log('Auction client connected:', socket.id);

    // Authenticate with ticket
    socket.on('authenticate', async (data) => {
        const { ticket } = data;

        try {
            // Verify ticket
            const result = await pool.query(`
        SELECT user_id, expires_at, used 
        FROM ws_tickets 
        WHERE ticket = $1
      `, [ticket]);

            if (result.rows.length === 0) {
                socket.emit('auth-error', { message: 'Invalid ticket' });
                return;
            }

            const ticketData = result.rows[0];

            // Check if expired
            if (new Date(ticketData.expires_at) < new Date()) {
                socket.emit('auth-error', { message: 'Ticket expired' });
                return;
            }

            // Check if already used
            if (ticketData.used) {
                socket.emit('auth-error', { message: 'Ticket already used' });
                return;
            }

            // Mark ticket as used
            await pool.query('UPDATE ws_tickets SET used = true WHERE ticket = $1', [ticket]);

            // Store user_id in socket
            socket.userId = ticketData.user_id;
            socket.emit('authenticated', { userId: ticketData.user_id });

            console.log(`User ${ticketData.user_id} authenticated`);
        } catch (error) {
            console.error('Auth error:', error);
            socket.emit('auth-error', { message: 'Authentication failed' });
        }
    });

    // Join auction room (only if authenticated)
    socket.on('join-auction', (auctionId) => {
        if (!socket.userId) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }
        socket.join(`auction-${auctionId}`);
        console.log(`User ${socket.userId} joined auction-${auctionId}`);
    });

    // Place bid (only if authenticated)
    socket.on('place-bid', async (data) => {
        if (!socket.userId) {
            socket.emit('bid-error', { message: 'Not authenticated' });
            return;
        }

        const { auctionId, bidAmount } = data;

        try {
            // Insert bid
            await pool.query(
                'INSERT INTO auction_bids (auction_id, bidder_id, bid_amount) VALUES ($1, $2, $3)',
                [auctionId, socket.userId, bidAmount]
            );

            // Update auction
            await pool.query(
                'UPDATE auctions SET current_price = $1, last_bid_time = NOW() WHERE id = $2',
                [bidAmount, auctionId]
            );

            // Broadcast to room
            auctionNamespace.to(`auction-${auctionId}`).emit('bid-placed', {
                auctionId,
                bidderId: socket.userId,
                bidAmount,
                timestamp: new Date()
            });

            socket.emit('bid-success', { message: 'Bid placed' });
        } catch (error) {
            console.error('Bid error:', error);
            socket.emit('bid-error', { message: 'Failed to place bid' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

const AuctionService = require('./services/auctionService');
const auctionService = new AuctionService(io);

// Expose auctionService via Express app
app.set('auctionService', auctionService);

// Start countdown checker
auctionService.startCountdownChecker();

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});