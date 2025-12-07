const pool = require('../config/database');

// Get all auctions (active and scheduled)
const getAuctions = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT a.*, p.product_name, p.main_image_path, s.store_name,
             COUNT(DISTINCT ab.bidder_id) as bidder_count
      FROM auctions a
      JOIN Product p ON a.product_id = p.product_id
      JOIN Store s ON p.store_id = s.store_id
      LEFT JOIN auction_bids ab ON a.id = ab.auction_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND a.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (search) {
      query += ` AND (p.product_name ILIKE $${paramCount} OR s.store_name ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    query += ` GROUP BY a.id, p.product_id, s.store_id ORDER BY a.start_time DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      data: result.rows,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get auctions error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const stopAuction = async (req, res) => {
  try {
    const { auctionId } = req.params;
    const { sellerId } = req.body; // In production, get from session/JWT
    
    await req.app.get('auctionService').stopAuction(auctionId, sellerId);
    res.json({ success: true, message: 'Auction stopped successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
const getAuctionById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        a.id, a.product_id, a.seller_id, a.starting_price, a.current_price, 
        a.status, a.start_time, a.end_time,
        p.product_name, 
        p.description, 
        p.main_image_path,
        u.name AS seller_name,
        (SELECT COUNT(DISTINCT bidder_id) FROM auction_bids WHERE auction_id = a.id) as bidder_count,
        (
            SELECT bidder_id 
            FROM auction_bids 
            WHERE auction_id = a.id 
            ORDER BY bid_amount DESC 
            LIMIT 1
        ) as winner_id
      FROM auctions a
      JOIN Product p ON a.product_id = p.product_id
      JOIN Users u ON a.seller_id = u.user_id
      WHERE a.id = $1
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
};

const cancelAuction = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  try {
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID diperlukan' });
    }

    const auctionService = req.app.get('auctionService');

    await auctionService.cancelAuction(id, userId);

    res.json({ success: true, message: 'Lelang berhasil dibatalkan' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message || 'Gagal membatalkan lelang' });
  }
};

module.exports = {
  getAuctions,
  getAuctionById,
  stopAuction,
  cancelAuction
};