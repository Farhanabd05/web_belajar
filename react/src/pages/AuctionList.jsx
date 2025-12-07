import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuctionWebSocket } from '../hooks/useAuctionWebSocket';

function AuctionList() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'scheduled'
  const [auctions, setAuctions] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const { socket, authenticated } = useAuctionWebSocket();
  const LIMIT = 10;

  // Debounce search
  const [searchDebounce, setSearchDebounce] = useState('');
  
  
  useEffect(() => {
	  const timer = setTimeout(() => {
      setSearchDebounce(search);
      setPage(1); // Reset to page 1 on search
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [search]);
  
  // Fetch auctions
  const fetchAuctions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: activeTab,
        page: page,
        limit: LIMIT,
        search: searchDebounce
      });

      const res = await fetch(`/api/node/auctions?${params}`);
      const data = await res.json();

      if (data.success) {
        setAuctions(data.data);
        setTotalPages(data.totalPages || 1);
	}
    } catch (error) {
      console.error('Failed to fetch auctions:', error);
    } finally {
		setLoading(false);
    }
  }, [activeTab, page, searchDebounce]);
  
  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);


  // Join auction-list room
  useEffect(() => {
	if (socket && authenticated) {
	  socket.emit('join-auction-list');

	  return () => {
		socket.emit('leave-auction-list');
	  };
	}
  }, [socket, authenticated]);
  
  // Listen for auction-started event
	// Listen for auction-started event
	useEffect(() => {
    console.log(' Setting up auction-started listener');
    
    if (!socket) {
      return;
    }

    const handleAuctionStarted = (data) => {
      console.log('🎉 AUCTION STARTED EVENT RECEIVED:', data);
      fetchAuctions();
    };
    const handleAuctionEnded = (data) => {
      console.log('🏁 AUCTION ENDED:', data);
      fetchAuctions(); // Refresh list agar kartu hilang dari tab Active
    };

    console.log('Attaching listener for auction-started');
    socket.on('auction-started', handleAuctionStarted);
    socket.on('auction-ended', handleAuctionEnded);

    return () => {
      console.log('Cleaning up auction-started listener');
      socket.off('auction-started', handleAuctionStarted);
      socket.off('auction-ended', handleAuctionEnded);
    };
	}, [socket, fetchAuctions]);

// Switch tab
  const handleTabChange = (tab) => {
	  setActiveTab(tab);
	  setPage(1);
	};
  return (
    <div style={{ padding: '20px' }}>
      <h1>Auction List</h1>

      {/* Tabs */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={() => handleTabChange('active')}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: activeTab === 'active' ? '#1976d2' : '#e0e0e0',
            color: activeTab === 'active' ? 'white' : 'black',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Lelang Aktif
        </button>
        <button 
          onClick={() => handleTabChange('scheduled')}
          style={{
            padding: '10px 20px',
            backgroundColor: activeTab === 'scheduled' ? '#1976d2' : '#e0e0e0',
            color: activeTab === 'scheduled' ? 'white' : 'black',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Lelang Akan Datang
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <input 
          type="text"
          placeholder="Search by product name or store..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: '10px',
            width: '300px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
        />
      </div>

      {/* Loading */}
      {loading && <p>Loading...</p>}

      {/* Auction Cards */}
      {!loading && auctions.length === 0 && (
        <p>No auctions found.</p>
      )}

	  <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '20px'
      }}>
        {auctions.map(auction => (
          <AuctionCard 
            key={auction.id} 
            auction={auction} 
            onClick={() => navigate(`/auction/${auction.id}`)}
            // Tambahkan ini: Refresh data ketika timer kartu habis
            onTimerEnd={() => fetchAuctions()} 
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: '8px 16px' }}
          >
            Previous
          </button>
          <span style={{ padding: '8px 16px' }}>
            Page {page} of {totalPages}
          </span>
          <button 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: '8px 16px' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function AuctionCard({ auction, onClick, onTimerEnd}) {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const endTime = new Date(auction.status === 'active' ? auction.end_time : auction.start_time).getTime();
      const remaining = endTime - now;
      
      if (remaining <= 0) {
        setTimeLeft(0);
		if (auction.status === 'scheduled' && onTimerEnd) {
             onTimerEnd(); 
        }
        return;
      }
      
      setTimeLeft(remaining);
    };

    // Initial calculation
    calculateTimeLeft();

    // Update every second
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [auction.end_time, auction.start_time]);

  const formatTime = (ms) => {
    if (ms === null || ms <= 0) return '00:00:00';
    
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isActive = auction.status === 'active';

  return (
    <div 
      onClick={onClick}
      style={{
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '15px',
        cursor: 'pointer',
        transition: 'box-shadow 0.3s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)'}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
    >
      <img 
        src={auction.main_image_path || '/placeholder.png'} 
        alt={auction.product_name}
        style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '4px' }}
      />
      
      <h3 style={{ margin: '10px 0', fontSize: '16px' }}>
        {auction.product_name}
      </h3>
      
      <p style={{ color: '#666', fontSize: '14px', margin: '5px 0' }}>
        {auction.store_name}
      </p>
      
      <p style={{ fontWeight: 'bold', color: '#1976d2', margin: '10px 0' }}>
        {isActive 
          ? `Current Bid: Rp ${parseInt(auction.current_price).toLocaleString()}`
          : `Starting Price: Rp ${parseInt(auction.starting_price).toLocaleString()}`
        }
      </p>
      
      <p style={{ fontSize: '14px', color: '#666' }}>
        {auction.bidder_count} bidders
      </p>
      
      {/* Countdown */}
      <p style={{ 
        fontSize: '14px', 
        fontWeight: 'bold',
        color: timeLeft !== null && timeLeft < 60000 ? '#f44336' : '#ff9800' 
      }}>
        {isActive 
          ? `Ends in: ${formatTime(timeLeft)}`
          : `Starts in: ${formatTime(timeLeft)}`
        }
      </p>
    </div>
  );
}

export default AuctionList;