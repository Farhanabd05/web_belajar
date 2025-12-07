import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuctionWebSocket } from '../hooks/useAuctionWebSocket';
import BidHistory from '../components/BidHistory';

function AuctionDetail() {
  const { id } = useParams();
  const [auction, setAuction] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [message, setMessage] = useState('');
  const [userBalance, setUserBalance] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null); 
  // Countdown states
  const [timeLeft, setTimeLeft] = useState(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [auctionEnded, setAuctionEnded] = useState(false);
  
  const { socket, authenticated } = useAuctionWebSocket();
  const timerRef = useRef(null);
  const navigate = useNavigate();
  const handleCancelAuction = async () => {
    if (!window.confirm("Apakah Anda yakin? Jika ada penawar, uang mereka akan dikembalikan.")) return;

    try {
      const res = await fetch(`/api/node/auctions/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId })
      });

      const data = await res.json();

      if (data.success) {
        alert("Lelang berhasil dibatalkan.");
        navigate('/auctions');
      } else {
        alert(data.message || "Gagal membatalkan lelang.");
      }
    } catch (err) {
      console.error(err);
      alert("Terjadi kesalahan koneksi.");
    }
  };

  const fetchUserBalance = useCallback(async () => {
    try {
      const balanceRes = await fetch('/api/get_user_balance.php');
      const balanceData = await balanceRes.json();
      if (balanceData.success) {
        setUserBalance(balanceData.balance);
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  }, []); 

  // 1. FETCH AUCTION DATA & SERVER TIME
  useEffect(() => {
    const fetchData = async () => {
      try {
        const auctionRes = await fetch(`/api/node/auctions/${id}`);
        const auctionData = await auctionRes.json();
        
        if (auctionData.success) {
          console.log("DEBUG DATA LELANG:", auctionData.data); // <--- LIHAT INI DI CONSOLE
          console.log("DEBUG WINNER ID:", auctionData.data.winner_id);
          console.log("DEBUG CURRENT USER:", currentUserId);
          setAuction(auctionData.data);
          setBidAmount(parseInt(auctionData.data.current_price) + 5000);
        }

        // Fetch server time untuk sync
        const timeRes = await fetch('/api/node/server-time');
        const timeData = await timeRes.json();
        const offset = timeData.serverTime - Date.now();
        setServerOffset(offset);
        try {
          const profileRes = await fetch('/api/get_user_id.php');
          const profileData = await profileRes.json();
          
          // Debugging: Cek data profile di console
          console.log("Profile Data:", profileData);

          if (profileData && profileData.user_id) {
             setCurrentUserId(profileData.user_id);
          }
        } catch (err) {
          console.error("Gagal load profile:", err);
        }
        fetchUserBalance();

      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };

    fetchData();
  }, [id, fetchUserBalance]);

  // Listen for balance updates via WebSocket
  useEffect(() => {
    if (!socket) return;

    socket.on('bid-success', (data) => {
      setMessage('Your bid was placed successfully!');
      // Update balance locally (optimistic)
      if (data.newBalance !== undefined) {
        setUserBalance(data.newBalance);
      }
    });

    return () => socket.off('bid-success');
  }, [socket]);

  // 2. COUNTDOWN TIMER LOGIC
  useEffect(() => {
    if (!auction || !auction.end_time) return;

    const endTime = new Date(auction.end_time).getTime();

    function updateCountdown() {
      const now = Date.now() + serverOffset;
      const remaining = endTime - now;

      if (remaining <= 0) {
        setTimeLeft(0);
        setAuctionEnded(true);
        setMessage('Auction has ended!');
        return; // Stop timer
      }

      setTimeLeft(remaining);
      
      // Schedule next update
      timerRef.current = setTimeout(updateCountdown, 1000);
    }

    // Start countdown
    updateCountdown();

    // Cleanup
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [auction, serverOffset]);

  // 3. HANDLE PAGE VISIBILITY (sleep/background)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && auction) {
        // Tab visible again - recalculate
        const now = Date.now() + serverOffset;
        const endTime = new Date(auction.end_time).getTime();
        const remaining = endTime - now;

        if (remaining <= 0) {
          setTimeLeft(0);
          setAuctionEnded(true);
          setMessage('Auction has ended!');
        } else {
          setTimeLeft(remaining);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [auction, serverOffset]);

  // 4. FORMAT TIME HELPER
  const formatTime = (milliseconds) => {
    if (milliseconds === null || milliseconds <= 0) return '00:00';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // 5. WEBSOCKET SETUP (existing code)
  useEffect(() => {
    if (socket && authenticated && id) {
      socket.emit('join-auction', id);

      socket.on('bid-placed', (data) => {
        if (data.auctionId == id) {
          setAuction(prev => ({
            ...prev,
            current_price: data.bidAmount,
            bidder_count: parseInt(prev?.bidder_count || 0) + 1,
            winner_id: data.bidderId
          }));
          setMessage(`New bid: Rp ${data.bidAmount}`);
          setBidAmount(parseInt(data.bidAmount) + 5000);
          
          fetchUserBalance();
        }
      });

      socket.on('bid-success', () => {
        setMessage('Your bid was placed successfully!');
      });

      socket.on('bid-error', (data) => {
        setMessage(`Error: ${data.message}`);
      });

      socket.on('auction-ended', (data) => {
        setAuctionEnded(true);
        setTimeLeft(0);
        
        setAuction(prev => ({
            ...prev,
            status: 'ended',        
            winner_id: data.winnerId
        }));

        setMessage(`Auction ended! Winner: User ${data.winnerId}`);
      });
    }

    return () => {
      if (socket) {
        socket.off('bid-placed');
        socket.off('bid-success');
        socket.off('bid-error');
        socket.off('auction-ended');
      }
    };
  }, [socket, authenticated, id, fetchUserBalance]);

  useEffect(() => {
     if(socket) {
         socket.on('auction-canceled', () => {
             alert("Lelang ini baru saja dibatalkan oleh penjual.");
             navigate('/auctions');
         });
         return () => socket.off('auction-canceled');
     }
  }, [socket, navigate]);

  // 6. BID HANDLER
  
  const handlePlaceBid = () => {
    if (!socket || !authenticated) {
      setMessage('Not connected to WebSocket');
      return;
    }

    if (auctionEnded) {
      setMessage('Auction has ended, cannot place bid');
      return;
    }

    socket.emit('place-bid', {
      auctionId: parseInt(id),
      bidAmount: parseInt(bidAmount)
    });
  };

  // 7. RENDER
  if (!auction) return <div>Loading...</div>;
  
  // Pastikan perbandingan ID aman (string vs number)
  const isSeller = String(currentUserId) === String(auction.seller_id);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <h1>Auction Detail</h1>
      
      {/* FOTO PRODUK */}
      <img 
        // Perhatikan nama properti: main_image_path (sesuai database) atau image_url (jika di-alias di query)
        // Di query langkah 1 saya pakai 'p.main_image_path', jadi di sini pakai 'auction.main_image_path'
        src={`/uploads/products/${auction.main_image_path ? auction.main_image_path.split('/').pop() : ''}`} 
        alt={auction.product_name}
        style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '8px', marginBottom: '20px' }}
        onError={(e) => { e.target.src = '/public/uploads/ui/placeholder.png'; }}
      />

      {/* INFO PRODUK */}
      <h2>{auction.product_name}</h2>
      <p style={{ color: '#666' }}>{auction.description}</p>
      <p>Dijual oleh:  <strong>{auction.seller_name} (user {auction.seller_id})</strong></p>
      
      {/* INFO STATUS */}
      <div style={{ margin: '20px 0', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
          <p>Current Price: <strong>Rp {parseInt(auction.current_price).toLocaleString()}</strong></p>
          <p>Total Bidders: {auction.bidder_count}</p>
          <p>Your Balance: <strong>Rp {userBalance !== null ? parseInt(userBalance).toLocaleString() : 'Loading...'}</strong></p>
          <p>Status: {authenticated ? '🟢 Live' : '🔴 Connecting...'}</p>

          {/* COUNTDOWN TIMER */}
          <p style={{ 
            fontSize: '24px', 
            fontWeight: 'bold',
            color: timeLeft !== null && timeLeft < 60000 ? 'red' : 'black',
            marginTop: '10px'
          }}>
            Time Left: {formatTime(timeLeft)}
          </p>
      </div>
      
      <hr />

      {/* LOGIKA UTAMA: SELLER vs BUYER */}
      {isSeller ? (
        <div style={{ padding: '20px', backgroundColor: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '8px', color: '#856404', marginBottom: '20px' }}>
            <h3>👑 Sudut Penjual</h3>
            <p>Ini adalah lelang Anda sendiri.</p>
            
            {/* LOGIKA TOMBOL CANCEL */}
            {(auction.status === 'active' || auction.status === 'scheduled') && (
                <div style={{ marginTop: '15px' }}>
                    <button 
                        onClick={handleCancelAuction}
                        style={{ 
                            padding: '10px 20px', 
                            backgroundColor: '#dc3545', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '4px', 
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        🚫 Batalkan Lelang
                    </button>
                    <p style={{ fontSize: '12px', marginTop: '5px' }}>
                        *Tindakan ini tidak dapat dibatalkan. Uang penawar tertinggi (jika ada) akan dikembalikan otomatis.
                    </p>
                </div>
            )}
            
            {auction.status === 'canceled' && (
                <p style={{ color: 'red', fontWeight: 'bold' }}>Lelang ini telah dibatalkan.</p>
            )}
        </div>
        ) : (
        // TAMPILAN BUYER
        <div style={{ marginBottom: '20px' }}>
            {/* KONDISI 1: LELANG MASIH JALAN (ACTIVE) */}
            {!auctionEnded && auction.status === 'active' && (
                <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
                    <h3>Place Your Bid</h3>
                    {/* ... (Form input bid Anda yang lama) ... */}
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <input 
                            type="number" 
                            value={bidAmount}
                            onChange={(e) => setBidAmount(e.target.value)}
                            placeholder="Enter bid amount"
                            style={{ flex: 1, padding: '10px' }}
                        />
                        <button 
                            onClick={handlePlaceBid}
                            style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                            Place Bid
                        </button>
                    </div>
                    <small style={{ color: '#666' }}>Minimal bid: Rp {(parseInt(auction.current_price) + 1).toLocaleString()}</small>
                </div>
            )}

            {(auctionEnded || auction.status === 'ended') && (
                <div style={{ padding: '20px', borderRadius: '8px', textAlign: 'center', border: '1px solid #ddd' }}>
                    
                    {String(currentUserId) === String(auction.winner_id) ? (
                        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '20px', borderRadius: '8px' }}>
                            <h2 style={{ fontSize: '30px', margin: '10px 0' }}>🎉 SELAMAT! 🎉</h2>
                            <p>Anda memenangkan lelang ini!</p>
                            <p>Pesanan telah dibuat otomatis.</p>
                            <button 
                                onClick={() => window.location.href = 'http://localhost:8082/order_history.php'} // Arahkan ke PHP Order History
                                style={{ marginTop: '10px', padding: '10px 20px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}
                            >
                                📦 Lihat Pesanan Saya
                            </button>
                        </div>
                    ) : (
                        <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '15px', borderRadius: '8px' }}>
                            <h3>🏁 Lelang Berakhir</h3>
                            <p>Sayang sekali, lelang ini sudah ditutup.</p>
                            <p>Pemenang: User #{auction.winner_id || '-'}</p>
                        </div>
                    )}
                </div>
            )}

            {auction.status === 'canceled' && (
                <div style={{ padding: '20px', backgroundColor: '#e2e3e5', color: '#383d41', borderRadius: '8px', textAlign: 'center' }}>
                    <h3>🚫 Dibatalkan</h3>
                    <p>Lelang ini telah dibatalkan oleh penjual.</p>
                </div>
            )}
        </div>
      )}
      
      {/* FEEDBACK MESSAGE */}
      {message && (
          <div style={{ padding: '10px', backgroundColor: '#e2e3e5', borderRadius: '4px', marginBottom: '20px' }}>
            <strong>Info:</strong> {message}
          </div>
      )}

      {/* HISTORI BID */}
      <BidHistory 
        auctionId={id} 
        socket={socket} 
        currentUserId={currentUserId}
      />
    </div>
  );
}

export default AuctionDetail;