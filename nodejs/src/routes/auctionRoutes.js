const express = require('express');
const router = express.Router();
const { getAuctions } = require('../controllers/auctionController');

router.get('/auctions', getAuctions);

module.exports = router;