<?php
  session_start();

  header('Content-Type: application/json');

  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
  }

  if ($_SESSION['role'] !== 'BUYER') {
    http_response_code(403); // forbidden
    echo json_encode(['success' => false, 'message' => 'Akses ditolak. Hanya Buyer yang bisa konfirmasi.']);
    exit;
  }

  $input=json_decode(file_get_contents('php://input'), true);
  if(!$input || !isset($input['order_id']) || !is_numeric($input['order_id'])){
    http_response_code(400); // bad Request
    echo json_encode(['success' => false, 'message' => 'Order ID tidak valid.']);
    exit;
  }
  $orderId=(int)$input['order_id'];
  $buyerId=$_SESSION['user_id'];

  $host = 'database'; $port = '5432'; $dbname = 'nimonspedia'; $user = 'user'; $password = 'password';
  $dsn = "pgsql:host=$host;port=$port;dbname=$dbname;user=$user;password=$password";

  try{
    $pdo = new PDO($dsn);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $pdo->beginTransaction();
    // verif apakah order ini milik buyer yang login, statusnya on_delivery, dan waktunya sudah lewat
    // for update buat ngunci
    $stmt = $pdo->prepare('
        SELECT status, delivery_time, store_id, total_price
        FROM "Order"
        WHERE order_id = ? AND buyer_id = ?
        FOR UPDATE
    ');
    $stmt->execute([$orderId, $buyerId]);
    $orderData=$stmt->fetch(PDO::FETCH_ASSOC);

    if(!$orderData){
      throw new Exception('Pesanan tdk ditemuin atau bkn punya anda');
    }
    $currentStatus = $orderData['status'];
    $deliveryTime=$orderData['delivery_time'];
    $storeId=$orderData['store_id'];
    $orderTotalPrice=(int) $orderData['total_price'];

    if ($currentStatus !== 'on_delivery'){
      throw new Exception('hanya pesanan dengan status on_delivery yg bs dikonfirmasi');
    }

    if(empty($deliveryTime) || time() < strtotime($deliveryTime)){
      throw new Exception('pesanan belum melewati estimasi waktu pengiriman');
    }
    // update status order jadi received dan set received_at
    $stmt=$pdo->prepare('UPDATE "Order" SET status = ?, received_at=CURRENT_TIMESTAMP WHERE order_id=?');
    $stmt->execute(['received',$orderId]);

    // tambah saldo ke toko seller, for update buat ngunci
    // kunci di bgn 'select', soalnya gk bisa ngunci di bgn 'update'
    $stmtLockStore=$pdo->prepare('SELECT store_id FROM Store WHERE store_id=? FOR UPDATE');
    $stmtLockStore->execute([$storeId]);

    $stmtUpdateStore=$pdo->prepare('UPDATE Store SET balance = balance + ? WHERE store_id=?');
    $stmtUpdateStore->execute([$orderTotalPrice, $storeId]);

    $pdo->commit();

    echo json_encode(['success'=> true, 'message'=>'Pesanan #' . $orderId . ' berhasil dikonfirmasi diterima. saldo toko udah ditambahin.']);
  } catch(Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500); // Error server
    echo json_encode(['success' => false, 'message' => 'Gagal konfirmasi pesanan: ' . $e->getMessage()]);
  }
?>