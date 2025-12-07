const pool = require('../config/database');

class AuctionService {
  constructor(io) {
    this.io = io;
    this.checkInterval = null;
  }

  startTransitionChecker() {
    console.log('Starting auction transition checker...');
    
    this.checkInterval = setInterval(() => {
      this.checkAuctionTransitions();
    }, 1000); // Check every second
  }

  async checkAuctionTransitions() {
    try {
      const endingSoonResult = await pool.query(`
        SELECT id 
        FROM auctions 
        WHERE status = 'active' 
          AND end_time > NOW() 
          AND end_time <= NOW() + INTERVAL '1 minutes'
          AND ending_soon_notified = FALSE
      `);
      if (endingSoonResult.rows.length > 0) {
          console.log(`🚨 FOUND CANDIDATE for Notification!`, endingSoonResult.rows);
      }
      for (const auction of endingSoonResult.rows) {
        await this.notifyEndingSoon(auction.id);
      }
      const result = await pool.query(`
        SELECT * FROM auctions 
        WHERE (status = 'scheduled' AND start_time <= NOW())
          OR (status = 'active' AND (
            (
              -- Auction punya bid DAN sudah 15 detik sejak last bid
              EXISTS (SELECT 1 FROM auction_bids WHERE auction_id = auctions.id)
              AND last_bid_time < NOW() - INTERVAL '15 seconds'
            )
            OR end_time <= NOW()  -- ATAU sudah lewat end_time
          ))
        ORDER BY id
      `);

      for (const auction of result.rows) {
        if (auction.status === 'scheduled') {
          await this.startAuction(auction.id);
        } else if (auction.status === 'active') {
          await this.endAuction(auction.id);
        }
      }

    } catch (error) {
      console.error('Error checking auction transitions:', error);
    }
  }
    async notifyEndingSoon(auctionId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const biddersRes = await client.query(`
            SELECT DISTINCT bidder_id FROM auction_bids WHERE auction_id = $1
        `, [auctionId]);

        // LOG DEBUG 3: Berapa user yang akan dikirimi pesan?
        console.log(`📨 Preparing notification for Auction #${auctionId}. Found ${biddersRes.rows.length} bidders.`);

        const namespace = this.io.of('/auction');
        
        biddersRes.rows.forEach(row => {
            // LOG DEBUG 4: Kirim ke room spesifik
            console.log(`👉 Emitting to room: user-${row.bidder_id}`);
            
            namespace.to(`user-${row.bidder_id}`).emit('notification', {
                type: 'info', 
                message: `⏳ Lelang #${auctionId} akan segera berakhir!`, // Pesan pendek dulu
                auctionId: auctionId
            });
        });

        await client.query(`
            UPDATE auctions SET ending_soon_notified = TRUE WHERE id = $1
        `, [auctionId]);

        await client.query('COMMIT');
        console.log(`⏳ Ending soon notification sent for Auction ${auctionId}`);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Failed sending ending soon notif:", err);
    } finally {
        client.release();
    }
  }

  async startAuction(auctionId) {
    try {
      // Validate auction sebelum start
      const validationResult = await pool.query(`
        SELECT 
          a.id,
          a.product_id,
          a.seller_id,
          a.starting_price,
          a.start_time,
          a.end_time,
          p.product_id as product_exists,
          p.stock,
          u.user_id as seller_exists
        FROM auctions a
        LEFT JOIN Product p ON a.product_id = p.product_id
        LEFT JOIN Users u ON a.seller_id = u.user_id
        WHERE a.id = $1
      `, [auctionId]);

      if (validationResult.rows.length === 0) {
        console.log(`❌ Auction ${auctionId} not found`);
        return;
      }

      const auction = validationResult.rows[0];

      // Check A: Product exists
      if (!auction.product_exists) {
        console.log(`❌ Auction ${auctionId} - Product deleted`);
        await this.cancelAuctionStr(auctionId, 'Product no longer exists');
        return;
      }

      // Check B: Stock available
      if (auction.stock <= 0) {
        console.log(`❌ Auction ${auctionId} - Out of stock`);
        await this.cancelAuctionStr(auctionId, 'Product out of stock');
        return;
      }

      // Check C: Starting price valid
      if (!auction.starting_price || auction.starting_price <= 0) {
        console.log(`❌ Auction ${auctionId} - Invalid starting price`);
        await this.cancelAuctionStr(auctionId, 'Invalid starting price');
        return;
      }

      // Check D: Seller exists
      if (!auction.seller_exists) {
        console.log(`❌ Auction ${auctionId} - Seller deleted`);
        await this.cancelAuctionStr(auctionId, 'Seller account no longer exists');
        return;
      }

      // Check E: Time valid
      if (new Date(auction.end_time) <= new Date(auction.start_time)) {
        console.log(`❌ Auction ${auctionId} - Invalid time range`);
        await this.cancelAuctionStr(auctionId, 'Invalid time configuration');
        return;
      }

      // All checks passed - start auction
      await pool.query(`
        UPDATE auctions 
        SET status = 'active', 
            last_bid_time = NOW() 
        WHERE id = $1
      `, [auctionId]);

      console.log(`✅ Auction ${auctionId} started (scheduled → active)`);

      // Also broadcast to specific auction room
      this.io.of('/auction').to(`auction-${auctionId}`).emit('auction-started', {
        auctionId: auctionId,
        timestamp: new Date()
      });
      // 2. Kirim juga ke user yang sedang melihat DAFTAR lelang (Auction List)
      this.io.of('/auction').to('auction-list').emit('auction-started', {
        auctionId: auctionId,
        timestamp: new Date()
      });
    } catch (error) {
      console.error(`Error starting auction ${auctionId}:`, error);
    }
  }

  async cancelAuctionStr(auctionId, reason) {
    try {
      await pool.query(`
        UPDATE auctions 
        SET status = 'cancelled'
        WHERE id = $1
      `, [auctionId]);

      console.log(`🚫 Auction ${auctionId} cancelled: ${reason}`);

      // Notify seller via WebSocket
      this.io.of('/auction').to(`auction-${auctionId}`).emit('auction-cancelled', {
        auctionId: auctionId,
        reason: reason,
        timestamp: new Date()
      });

    } catch (error) {
      console.error(`Error cancelling auction ${auctionId}:`, error);
    }
  }
  async cancelAuction(auctionId, userId) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const auctionRes = await client.query(`
        SELECT * FROM auctions WHERE id = $1 FOR UPDATE
      `, [auctionId]);

      if (auctionRes.rows.length === 0) {
        throw new Error('Lelang tidak ditemukan');
      }

      const auction = auctionRes.rows[0];

      if (String(auction.seller_id) !== String(userId)) {
        throw new Error('Anda tidak memiliki izin membatalkan lelang ini');
      }

      if (auction.status !== 'active' && auction.status !== 'scheduled') {
        throw new Error('Lelang yang sudah berakhir atau dibatalkan tidak bisa dicancel');
      }

      const highestBidRes = await client.query(`
        SELECT * FROM auction_bids 
        WHERE auction_id = $1 
        ORDER BY bid_amount DESC 
        LIMIT 1
      `, [auctionId]);

      if (highestBidRes.rows.length > 0) {
        const highestBid = highestBidRes.rows[0];
        console.log(`💸 Refunding IDR ${highestBid.bid_amount} to User ${highestBid.bidder_id} due to cancellation`);

        await client.query(`
          UPDATE Users 
          SET balance = balance + $1 
          WHERE user_id = $2
        `, [highestBid.bid_amount, highestBid.bidder_id]);
      }

      await client.query(`
        UPDATE auctions 
        SET status = 'cancelled', updated_at = NOW() 
        WHERE id = $1
      `, [auctionId]);

      await client.query('COMMIT');
      
      console.log(`✅ Auction ${auctionId} cancelled by seller ${userId}`);
      
      this.io.of('/auction').to(`auction-${auctionId}`).emit('auction-canceled', {
        auctionId: auctionId,
        message: 'Lelang dibatalkan oleh penjual.'
      });

      return { success: true };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Error cancelling auction ${auctionId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async endAuction(auctionId) {
    try {
      // Get auction with highest bid
      const auctionResult = await pool.query(`
        SELECT a.*, ab.bidder_id, ab.bid_amount
        FROM auctions a
        LEFT JOIN auction_bids ab ON a.id = ab.auction_id
        WHERE a.id = $1
        ORDER BY ab.bid_amount DESC, ab.bid_time ASC
        LIMIT 1
      `, [auctionId]);

      if (auctionResult.rows.length === 0) return;

      const auction = auctionResult.rows[0];
      const winnerId = auction.bidder_id;

      // Update auction status
      await pool.query(`
        UPDATE auctions 
        SET status = 'ended', 
            winner_id = $1,
            end_time = NOW()
        WHERE id = $2
      `, [winnerId, auctionId]);

      console.log(`✅ Auction ${auctionId} ended. Winner: ${winnerId || 'none'}`);

      // Broadcast to WebSocket clients
      this.io.of('/auction').to(`auction-${auctionId}`).emit('auction-ended', {
        auctionId: auctionId,
        winnerId: winnerId,
        finalPrice: auction.current_price,
        timestamp: new Date()
      });

      // TODO: Create order if there's a winner
      if (winnerId) {
        await this.createOrder(auctionId, winnerId, auction.current_price);
        this.io.of('/auction').to(`user-${winnerId}`).emit('notification', {
            type: 'success', // Toast akan warna Hijau 🎉
            message: `🎉 Selamat! Anda memenangkan lelang #${auctionId}.`,
            auctionId: auctionId
        });
        console.log(`🏆 Win notification sent to User ${winnerId}`);
      }
      // bc ke Room LIST (biar kartu di halaman auction-list hilang/pindah)
      this.io.of('/auction').to('auction-list').emit('auction-ended', {
        auctionId: auctionId
      });
    } catch (error) {
      console.error(`Error ending auction ${auctionId}:`, error);
    }
  }

async createOrder(auctionId, buyerId, totalPrice) {
    try {
      const auctionResult = await pool.query(`
        SELECT a.product_id, a.seller_id, s.store_id 
        FROM auctions a
        JOIN Store s ON a.seller_id = s.user_id
        WHERE a.id = $1
      `, [auctionId]);

      if (auctionResult.rows.length === 0) {
        console.error(`Auction ${auctionId} not found or Seller has no Store.`);
        return;
      }

      const { product_id, seller_id, store_id } = auctionResult.rows[0];

      const buyerResult = await pool.query(`
        SELECT address FROM Users WHERE user_id = $1
      `, [buyerId]);
      
      const shippingAddress = buyerResult.rows[0]?.address || 'Alamat belum diatur';

      const orderResult = await pool.query(`
        INSERT INTO "Order" (buyer_id, store_id, total_price, shipping_address, status, created_at)
        VALUES ($1, $2, $3, $4, 'approved', NOW())
        RETURNING order_id
      `, [buyerId, store_id, totalPrice, shippingAddress]);

      const orderId = orderResult.rows[0].order_id;

      await pool.query(`
        INSERT INTO Order_Items (order_id, product_id, quantity, price_at_order, subtotal)
        VALUES ($1, $2, 1, $3, $3)
      `, [orderId, product_id, totalPrice]);

      console.log(`📦 Order created successfully: Order #${orderId} for Auction #${auctionId} (Store #${store_id})`);

    } catch (error) {
      console.error(`Error creating order for auction ${auctionId}:`, error);
    }
  }

  stopTransitionChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      console.log('Auction transition checker stopped');
    }
  }
}

module.exports = AuctionService;