const pool = require('../config/database');

class AuctionService {
  constructor(io) {
    this.io = io;
    this.auctionNamespace = io.of('/auction');
  }

  // Start the countdown checker
  startCountdownChecker() {
    // Check every 1 second for auctions close to deadline
    setInterval(async () => {
      await this.checkAndEndAuctions();
    }, 1000);
    
    console.log('Auction countdown checker started');
  }

  async checkAndEndAuctions() {
    try {
      // Find auctions that should end (15s after last bid, still active)
      const result = await pool.query(`
        SELECT id, product_id, seller_id, current_price, winner_id
        FROM auctions
        WHERE status = 'active' 
        AND last_bid_time < NOW() - INTERVAL '15 seconds'
      `);

      for (const auction of result.rows) {
        await this.endAuction(auction);
      }
    } catch (error) {
      console.error('Check auctions error:', error);
    }
  }

  async endAuction(auction) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get the highest bidder
      const bidResult = await client.query(`
        SELECT bidder_id, bid_amount
        FROM auction_bids
        WHERE auction_id = $1
        ORDER BY bid_amount DESC, bid_time ASC
        LIMIT 1
      `, [auction.id]);

      const winner = bidResult.rows[0];
      
      if (winner) {
        // Update auction status
        await client.query(`
          UPDATE auctions
          SET status = 'ended', winner_id = $1, end_time = NOW()
          WHERE id = $2
        `, [winner.bidder_id, auction.id]);

        // Create order automatically
        await client.query(`
          INSERT INTO "Order" (buyer_id, store_id, total_price, shipping_address, status, created_at)
          
          SELECT $1, p.store_id, $2, u.address, 'waiting_approval', NOW()
          FROM Product p
          JOIN Users u ON u.user_id = $1
          WHERE p.product_id = $3
        `, [winner.bidder_id, winner.bid_amount, auction.product_id]);

        // Broadcast auction ended
        this.auctionNamespace.to(`auction-${auction.id}`).emit('auction-ended', {
          auctionId: auction.id,
          winnerId: winner.bidder_id,
          finalPrice: winner.bid_amount
        });

        console.log(`Auction ${auction.id} ended. Winner: ${winner.bidder_id}`);
      } else {
        // No bids - cancel auction
        await client.query(`
          UPDATE auctions SET status = 'cancelled', end_time = NOW() WHERE id = $1
        `, [auction.id]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`End auction ${auction.id} error:`, error);
    } finally {
      client.release();
    }
  }

  // Seller manually stops auction
  async stopAuction(auctionId, sellerId) {
    const result = await pool.query(`
      SELECT * FROM auctions WHERE id = $1 AND seller_id = $2 AND status = 'active'
    `, [auctionId, sellerId]);

    if (result.rows.length === 0) {
      throw new Error('Auction not found or unauthorized');
    }

    await this.endAuction(result.rows[0]);
    return { success: true, message: 'Auction stopped' };
  }
}

module.exports = AuctionService;