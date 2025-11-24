import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuctionWebSocket } from '../hooks/useAuctionWebSocket';

function AuctionDetail() {
  const { id } = useParams();
  const [auction, setAuction] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [message, setMessage] = useState('');
  
  const { socket, authenticated } = useAuctionWebSocket();

  useEffect(() => {
    // Fetch auction details
    fetch(`/api/node/auctions?status=active`)
      .then(res => res.json())
      .then(data => {
        const found = data.data.find(a => a.id == id);
        setAuction(found);
        if (found) {
          setBidAmount(parseInt(found.current_price) + 5000);
        }
      });
  }, [id]);

  useEffect(() => {
    if (socket && authenticated && id) {
      // Join auction room
      socket.emit('join-auction', id);

      // Listen for new bids
      socket.on('bid-placed', (data) => {
        if (data.auctionId == id) {
          setAuction(prev => ({
            ...prev,
            current_price: data.bidAmount,
            bidder_count: parseInt(prev?.bidder_count || 0) + 1
          }));
          setMessage(`New bid: Rp ${data.bidAmount}`);
          setBidAmount(parseInt(data.bidAmount) + 5000);
        }
      });

      socket.on('bid-success', () => {
        setMessage('Your bid was placed successfully!');
      });

      socket.on('bid-error', (data) => {
        setMessage(`Error: ${data.message}`);
      });

      socket.on('auction-ended', (data) => {
        setMessage(`Auction ended! Winner: User ${data.winnerId}`);
      });
    }
  }, [socket, authenticated, id]);

  const handlePlaceBid = () => {
    if (!socket || !authenticated) {
      setMessage('Not connected to WebSocket');
      return;
    }

    socket.emit('place-bid', {
      auctionId: parseInt(id),
      bidAmount: parseInt(bidAmount)
    });
  };

  if (!auction) return <div>Loading...</div>;

  return (
    <div>
      <h1>Auction Detail</h1>
      <h2>{auction.name || auction.product_name}</h2>
      <p>Current Price: Rp {auction.current_price}</p>
      <p>Total Bidders: {auction.bidder_count}</p>
      <p>Status: {authenticated ? '🟢 Connected' : '🔴 Not connected'}</p>
      
      <hr />
      
      <h3>Place Your Bid</h3>
      <input 
        type="number" 
        value={bidAmount}
        onChange={(e) => setBidAmount(e.target.value)}
        placeholder="Enter bid amount"
      />
      <button onClick={handlePlaceBid}>Place Bid</button>
      
      {message && <p><strong>{message}</strong></p>}
    </div>
  );
}

export default AuctionDetail;