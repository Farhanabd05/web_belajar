<?php
session_start();

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

if($_SESSION['role']!=='SELLER'){
  http_response_code(403);
  echo json_encode(['success'=>false, 'message' => 'Akses Ditolak.']);
  exit;
}

// ambil order id dari data POST
$input = json_decode(file_get_contents('php://input'), true);
if(!$input || !isset($input['order_id']) || !is_numeric($input['order_id'])){
  http_response_code(400);
  echo json_encode(['success'=>false, 'message'=> 'Order ID tidak valid.']);
  exit;
}
$orderId=(int)$input['order_id'];
$sellerUserId=$_SESSION['user_id'];

// konek ke db
$host = 'database'; $port = '5432'; $dbname = 'nimonspedia'; $user = 'user'; $password = 'password';
$dsn = "pgsql:host=$host;port=$port;dbname=$dbname;user=$user;password=$password";

try{
  $pdo=new PDO($dsn);
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

  // mulai transaksi
  $pdo->beginTransaction();

  // dapetin store_id milik seller yang login
  $stmt=$pdo->prepare('SELECT store_id FROM Store WHERE user_id = ?');
  $stmt->execute([$sellerUserId]);
  $storeId = $stmt->fetchColumn();

  if(!$storeId){
    throw new Exception('Toko tidak ditemukan untuk seller ini');
  }

  // verif: apakah order ini milik toko sller dan sstatusnya waiting approval?
  // for update digunain buat ngunci, agar tidk bisa diubah proses lain
  $stmt=$pdo->prepare('SELECT status FROM "Order" WHERE order_id = ? AND store_id = ? FOR UPDATE');
  $stmt->execute([$orderId, $storeId]);
  $currentStatus = $stmt->fetchColumn();

  if(!$currentStatus){
    throw new Exception('Pesanan tidak ditemukan atau bukan milik toko Anda');
  }

  if($currentStatus!=='waiting_approval'){
    throw new Exception('Hanya pesanan dengan status "Waiting Approval" yang bisa disetujui');
  }

  // update status order jadi approved dan set confirmed at
  $stmt = $pdo->prepare('UPDATE "Order" SET status = ?, confirmed_at = CURRENT_TIMESTAMP WHERE order_id = ?');
  $stmt->execute(['approved', $orderId]);
  
  // simpan
  $pdo->commit();

  // kirim response suces
  echo json_encode(['success'=> true, 'message'=>'Pesanan #' . $orderId . ' berhasil disetujui.']);


} catch (Exception $e){
  // jika eror, batalin
  if($pdo->inTransaction()){
    $pdo->rollBack();
  }
  http_response_code(500); //eror server
  echo json_encode(['success'=>false, 'message'=>'Gagal menyetujui pesanan: ' . $e->getMessage()]);
}
?>