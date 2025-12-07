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

// Simple server time endpoint
app.get('/server-time', (req, res) => {
  res.json({ 
    serverTime: Date.now()
  });
});

// Get bid history for auction
app.get('/auctions/:auctionId/bids', async (req, res) => {
  const { auctionId } = req.params;
  const limit = parseInt(req.query.limit) || 10;
  const offset = parseInt(req.query.offset) || 0;

  try {
    // Get bids with user info
    const result = await pool.query(`
      SELECT 
        ab.id,
        ab.bidder_id,
        ab.bid_amount,
        ab.bid_time,
        u.name
      FROM auction_bids ab
      JOIN Users u ON ab.bidder_id = u.user_id
      WHERE ab.auction_id = $1
      ORDER BY ab.bid_time DESC
      LIMIT $2 OFFSET $3
    `, [auctionId, limit, offset]);

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM auction_bids WHERE auction_id = $1',
      [auctionId]
    );

    res.json({
      success: true,
      bids: result.rows,
      total: parseInt(countResult.rows[0].total),
      hasMore: offset + limit < parseInt(countResult.rows[0].total)
    });

  } catch (error) {
    console.error('Get bids error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch bids' });
  }
});

// Enhanced auction list endpoint
app.get('/auctions', async (req, res) => {
  const { status, page = 1, limit = 10, search = '' } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT 
        a.*,
        p.product_name,
        p.image_url,
        s.store_name,
        COUNT(DISTINCT ab.bidder_id) as bidder_count
      FROM auctions a
      JOIN Product p ON a.product_id = p.product_id
      JOIN Store s ON p.store_id = s.store_id
      LEFT JOIN auction_bids ab ON a.id = ab.auction_id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 0;

    // Filter by status
    if (status) {
      paramCount++;
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
    }

    // Search by product name OR store name
    if (search) {
      paramCount++;
      query += ` AND (p.product_name ILIKE $${paramCount} OR s.store_name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` GROUP BY a.id, p.product_name, p.image_url, s.store_name`;
    query += ` ORDER BY a.created_at DESC`;
    
    // Get total count
    const countQuery = query.replace(
      'SELECT a.*, p.product_name, p.image_url, s.store_name, COUNT(DISTINCT ab.bidder_id) as bidder_count',
      'SELECT COUNT(DISTINCT a.id) as total'
    ).split('GROUP BY')[0];

    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || 0);

    // Add pagination
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      page: parseInt(page),
      limit: parseInt(limit),
      total: total,
      totalPages: Math.ceil(total / limit)
    });

  } catch (error) {
    console.error('Get auctions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch auctions' });
  }
});

app.get('/auctions/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const query = `
      SELECT 
        a.id, a.product_id, a.seller_id, a.starting_price, a.current_price, 
        a.status, a.start_time, a.end_time,
        COUNT(DISTINCT ab.bidder_id) as bidder_count,
        p.product_name, 
        p.description, 
        p.main_image_path as image_url, 
        u.name as seller_name,
        u.user_id as seller_user_id
      FROM auctions a
      JOIN Product p ON a.product_id = p.product_id
      JOIN Users u ON a.seller_id = u.user_id
      LEFT JOIN auction_bids ab ON a.id = ab.auction_id -- JOIN KE BIDS
      WHERE a.id = $1
      GROUP BY a.id, p.product_id, u.user_id
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Lelang tidak ditemukan' });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Error fetching auction detail:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
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
    // Join auction-list room
    socket.on('join-auction-list', () => {
        console.log('📥 Received join-auction-list event from', socket.id); // ← ADD THIS
        socket.join('auction-list');
        console.log(`✅ Socket ${socket.id} joined auction-list room`);
    });

    // Leave auction-list room
    socket.on('leave-auction-list', () => {
        socket.leave('auction-list');
        console.log(`Socket ${socket.id} left auction-list room`);
    });

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
            // Masukkan user ke "Kamar Pribadi" di dalam namespace /auction
            const userRoom = `user-${ticketData.user_id}`;
            socket.join(userRoom);
            console.log(`👤 User ${ticketData.user_id} joined personal room: ${userRoom}`);
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
            return socket.emit('bid-error', { message: 'Not authenticated' });
        }

        const { auctionId, bidAmount } = data;
        const client = await pool.connect(); // Get client for transaction

        try {
            await client.query('BEGIN'); // Start transaction

            // VALIDATION
            const validationResult = await client.query(`
            SELECT 
                a.id, a.status, a.current_price, a.seller_id, a.end_time,
                u.role, u.balance
            FROM auctions a
            JOIN Users u ON u.user_id = $1
            WHERE a.id = $2
            `, [socket.userId, auctionId]);

            if (validationResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return socket.emit('bid-error', { message: 'Auction not found' });
            }

            const auction = validationResult.rows[0];
            const user = validationResult.rows[0];

            // All validations (1-8
            
            if (socket.userId === auction.seller_id) {
                await client.query('ROLLBACK');
                return socket.emit('bid-error', { message: 'Sellers cannot bid on their own auctions' });
            }

            if (user.role.toUpperCase() !== 'BUYER') {
                await client.query('ROLLBACK');
                return socket.emit('bid-error', { message: 'Only buyers can place bids' });
            }

            // Check 3: Auction is active
            if (auction.status !== 'active') {
            return socket.emit('bid-error', { 
                message: `Auction is ${auction.status}, cannot place bid` 
            });
            }

            // Check 4: Auction not ended (timing)
            if (new Date(auction.end_time) <= new Date()) {
            return socket.emit('bid-error', { 
                message: 'Auction has ended' 
            });
            }
            const currentPrice = parseFloat(auction.current_price);
            const newBidAmount = parseFloat(bidAmount);

            if (newBidAmount <= currentPrice) {
                await client.query('ROLLBACK');
                return socket.emit('bid-error', { 
                    message: `Bid must be higher than current price (Rp ${currentPrice})` 
                });
            }

            const MIN_INCREMENT = 5000;
                if (newBidAmount < currentPrice + MIN_INCREMENT) {
                await client.query('ROLLBACK');
                return socket.emit('bid-error', { 
                    message: `Bid must be at least Rp ${MIN_INCREMENT} higher` 
                });
            }

            if (user.balance < newBidAmount) {
                await client.query('ROLLBACK');
                return socket.emit('bid-error', { 
                    message: `Insufficient balance. Your balance: Rp ${user.balance}` 
                });
            }

            const duplicateCheck = await pool.query(`
                SELECT id FROM auction_bids
                WHERE auction_id = $1 
                AND bidder_id = $2 
                AND bid_amount = $3
                AND bid_time > NOW() - INTERVAL '5 seconds'
            `, [auctionId, socket.userId, newBidAmount]);

            if (duplicateCheck.rows.length > 0) {
            return socket.emit('bid-error', { 
                message: 'Duplicate bid detected. Please wait a moment.' 
            });
            }

            // BALANCE DEDUCTION LOGIC
            // 1. Get previous highest bidder (if exists)
            const previousBidResult = await client.query(`
                SELECT bidder_id, bid_amount 
                FROM auction_bids 
                WHERE auction_id = $1 
                ORDER BY bid_amount DESC, bid_time ASC 
                LIMIT 1
            `, [auctionId]);

            // 2. Refund previous bidder
            if (previousBidResult.rows.length > 0) {
                const prevBidder = previousBidResult.rows[0];
                await client.query(`
                    UPDATE Users 
                    SET balance = balance + $1 
                    WHERE user_id = $2
                `, [prevBidder.bid_amount, prevBidder.bidder_id]);
                
                console.log(`💰 Refunded User ${prevBidder.bidder_id}: +Rp ${prevBidder.bid_amount}`);
                // cek biar gk ngirim notif ke diri sendiri (misal top-up bid)
                if (String(prevBidder.bidder_id) !== String(socket.userId)) {
                    
                    // kirim pesan ke "kamar pribadi" user yang tersalip
                    // krn kita udah di dlm 'auctionNamespace', kita bisa pake 'auctionNamespace.to'
                    auctionNamespace.to(`user-${prevBidder.bidder_id}`).emit('notification', {
                        type: 'outbid',
                        message: `[WARNING] Tawaran Anda pada lelang #${auctionId} telah terlampaui!`,
                        auctionId: auctionId,
                        newAmount: newBidAmount
                    });
                    
                    console.log(`[NOTIF] Sent outbid notification to User ${prevBidder.bidder_id}`);
                }
            }

            // 3. Deduct new bidder's balance
            await client.query(`
                UPDATE Users 
                SET balance = balance - $1 
                WHERE user_id = $2
                `, [newBidAmount, socket.userId]
            );

            console.log(`💸 Deducted User ${socket.userId}: -Rp ${newBidAmount}`);

            // 4. Save bid to auction_bids
            const result = await client.query(`
                INSERT INTO auction_bids (auction_id, bidder_id, bid_amount, bid_time)
                VALUES ($1, $2, $3, NOW())
                RETURNING id, auction_id, bidder_id, bid_amount, bid_time
            `, [auctionId, socket.userId, newBidAmount]);

            const savedBid = result.rows[0];

            // 5. Update auction current_price & last_bid_time
            await client.query(`
                UPDATE auctions 
                SET current_price = $1, last_bid_time = NOW()
                WHERE id = $2
            `, [newBidAmount, auctionId]);

            await client.query('COMMIT'); // Commit transaction

            console.log(`[OK] Bid placed: User ${socket.userId} bid Rp ${newBidAmount} on auction ${auctionId}`);

            // Broadcast to all users
            auctionNamespace.to(`auction-${auctionId}`).emit('bid-placed', {
            auctionId: auctionId,
            bidAmount: newBidAmount,
            bidderId: socket.userId,
            timestamp: savedBid.bid_time
            });

            // Confirm to bidder
            socket.emit('bid-success', {
            bidId: savedBid.id,
            amount: newBidAmount
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Place bid error:', error);
            socket.emit('bid-error', { message: 'Failed to place bid. Please try again.' });
        } finally {
            client.release(); // Release connection back to pool
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Ganti bagian AuctionService initialization
const AuctionService = require('./services/auctionService');
const auctionService = new AuctionService(io);

// Start transition checker
auctionService.startTransitionChecker();
app.set('auctionService', auctionService);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, stopping transition checker...');
  auctionService.stopTransitionChecker();
  process.exit(0);
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});