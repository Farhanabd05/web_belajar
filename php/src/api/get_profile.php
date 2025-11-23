<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Anda harus login terlebih dahulu.']);
    exit;
}

$userId = $_SESSION['user_id'];
$userRole = $_SESSION['role']; // Ambil role

$host = 'database'; $port = '5432'; $dbname = 'nimonspedia'; $user = 'user'; $password_db = 'password';
$dsn = "pgsql:host=$host;port=$port;dbname=$dbname;user=$user;password=$password_db";

try {
    $pdo = new PDO($dsn);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Ambil data user (selalu)
    $stmtUser = $pdo->prepare('SELECT name, email, address FROM Users WHERE user_id = ?');
    $stmtUser->execute([$userId]);
    $userProfile = $stmtUser->fetch(PDO::FETCH_ASSOC);

    if (!$userProfile) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Data pengguna tidak ditemukan.']);
        exit;
    }

    // Buat respons dengan data user di dalam key "user"
    $responseData = ['user' => $userProfile];

    // Jika role adalah Seller, ambil data toko
    if ($userRole === 'SELLER') {
        $stmtStore = $pdo->prepare('SELECT store_id, store_name, store_description, store_logo_path FROM Store WHERE user_id = ?');
        $stmtStore->execute([$userId]);
        $storeProfile = $stmtStore->fetch(PDO::FETCH_ASSOC);
        // Tambahkan data toko ke respons di dalam key "store"
        $responseData['store'] = $storeProfile ?: null;
    }

    echo json_encode($responseData); // Kirim data gabungan

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Terjadi kesalahan server: ' . $e->getMessage()]);
}
?>