import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AuctionList from './pages/AuctionList';
import AuctionDetail from './pages/AuctionDetail';
import CreateAuction from './pages/CreateAuction';
import Toast from './components/Toast';
import { useAuctionWebSocket } from './hooks/useAuctionWebSocket';

function App() {
  const [role, setRole] = useState(null);
  const { socket } = useAuctionWebSocket();
  const [toast, setToast] = useState(null);
  useEffect(() => {
    // Cek role saat aplikasi dimuat
    fetch('/api/get_user_id.php')
      .then(res => res.json())
      .then(data => {
        if (data.success) setRole(data.role);
      })
      .catch(err => console.error(err));
  }, []);
  useEffect(() => {
    if (socket) {
        // Dengarkan event 'notification' dari server
        socket.on('notification', (data) => {
            console.log("🔔 Notification received:", data);
            
            setToast({ message: data.message, type: data.type });
            const audio = new Audio('/public/uploads/ui/notif.mp3');
            audio.play().catch(e => console.log('Audio play failed', e));
        });
    }
    // cleanup listener saat unmount
    return () => {
        if (socket) socket.off('notification');
    };
  }, [socket]);
  return (
    <BrowserRouter>
      {toast && (
        <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
        />
      )}
      <nav style={{ padding: '10px', background: '#f0f0f0', marginBottom: '20px' }}>
        <Link to="/auctions" style={{ marginRight: '15px' }}>Auction List</Link>
        {role === 'SELLER' && (
          <Link to="/create-auction">Create Auction</Link>
        )}
      </nav>
      <Routes>
        <Route path="/auctions" element={<AuctionList />} />
        <Route path="/auction/:id" element={<AuctionDetail />} />
        <Route path="/create-auction" element={
            role === 'SELLER' ? <CreateAuction /> : <div>Akses Ditolak: Khusus Seller</div>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;