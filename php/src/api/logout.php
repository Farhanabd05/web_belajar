<?php
session_start();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}
session_unset();
session_destroy();
header('Content-Type: application/json');
echo json_encode([
    'success' => true, 
    'message' => 'Anda telah berhasil logout.'
]);
?>