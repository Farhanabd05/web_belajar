const express = require('express');
const router = express.Router();
const { getAuctions, getAuctionById, cancelAuction } = require('../controllers/auctionController');

router.get('/auctions', getAuctions);
router.get('/auctions/:id', getAuctionById);
router.post('/auctions/:id/cancel', cancelAuction);
module.exports = router;