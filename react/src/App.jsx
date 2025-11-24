import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import AuctionList from './pages/AuctionList';
import AuctionDetail from './pages/AuctionDetail';

function App() {
  return (
    <BrowserRouter>
      <nav>
        <Link to="/">Auction List</Link>
      </nav>
      <Routes>
        <Route path="/" element={<AuctionList />} />
        <Route path="/auction/:id" element={<AuctionDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;