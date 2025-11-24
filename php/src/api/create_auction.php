<?php
session_start();
header('Content-Type: application/json');

// Check if user is logged in and is a seller
if (!isset($_SESSION['user_id']) || $_SESSION['role'] !== 'SELLER') {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Unauthorized']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

$product_id = $data['product_id'] ?? null;
$starting_price = $data['starting_price'] ?? null;
$start_time = $data['start_time'] ?? null;

// Validation
if (!$product_id || !$starting_price || !$start_time) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

// Database connection
$host = 'database';
$port = '5432';
$dbname = 'nimonspedia';
$user = 'user';
$password_db = 'password';
$dsn = "pgsql:host=$host;port=$port;dbname=$dbname;user=$user;password=$password_db";

try {
    $pdo = new PDO($dsn);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Verify product belongs to this seller
    $stmt = $pdo->prepare("SELECT store_id FROM Product WHERE product_id = ?");
    $stmt->execute([$product_id]);
    $product = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$product) {
        throw new Exception('Product not found');
    }
    
    // Verify seller owns this product
    $stmt = $pdo->prepare("SELECT store_id FROM Store WHERE user_id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $store = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($store['store_id'] != $product['store_id']) {
        throw new Exception('Unauthorized - product does not belong to your store');
    }
    
    // Insert auction
    $stmt = $pdo->prepare("
        INSERT INTO auctions (product_id, seller_id, starting_price, current_price, status, start_time, created_at)
        VALUES (?, ?, ?, ?, 'scheduled', ?, NOW())
    ");
    
    $stmt->execute([
        $product_id,
        $_SESSION['user_id'],
        $starting_price,
        $starting_price,
        $start_time
    ]);
    
    $auction_id = $pdo->lastInsertId();
    
    echo json_encode([
        'success' => true,
        'message' => 'Auction created successfully',
        'auction_id' => $auction_id
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
?>