import { useState, useEffect } from 'react';

function AuctionList() {
	const [auctions, setAuctions] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetchAuctions();
	}, []);

	const fetchAuctions = async () => {
		try {
			const response = await fetch('/api/node/auctions?status=active');
			const data = await response.json();
			setAuctions(data.data || []);
		} catch (error) {
			console.error('Error fetching auctions:', error);
		} finally {
			setLoading(false);
		}
	};

	if (loading) return <div>Loading...</div>;

	return (
		<div>
			<h1>Active Auctions</h1>
			{auctions.length === 0 ? (
				<p>No active auctions</p>
			) : (
				<ul>
					{auctions.map(auction => (
						<li key={auction.id}>
							<a href={`/auction/${auction.id}`}>
								<strong>{auction.name || auction.product_name}</strong>
							</a>
							<br />
							Current Price: Rp {auction.current_price}
							<br />
							Bidders: {auction.bidder_count}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default AuctionList;