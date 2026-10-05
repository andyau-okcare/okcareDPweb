<?php
header('Content-Type: application/json');

// Your Database Connection Settings
$host = '127.0.0.1';
$user = 'root';
$pass = 'Okc25258486!';
$db   = 'ccsv_system';
$port = 3307;

// Establish connection
$conn = new mysqli($host, $user, $pass, $db, $port);

if ($conn->connect_error) {
    echo json_encode([
        'success' => false, 
        'error' => 'Database Connection Failed: ' . $conn->connect_error
    ]);
    exit;
}

$action = $_GET['action'] ?? '';

// 1. Fetch all elders for the table view
if ($action === 'get') {
    $result = $conn->query("SELECT * FROM elders ORDER BY id DESC");
    $elders = [];
    
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $elders[] = $row;
        }
    }
    
    echo json_encode($elders);
    exit;
}

// 2. Add a new elder from the form submission
if ($action === 'add' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    $name_chi = $conn->real_escape_string($data['name_chi'] ?? '');
    $hkid = $conn->real_escape_string($data['hkid'] ?? '');
    $ccsv_number = $conn->real_escape_string($data['ccsv_number'] ?? '');
    $tier = intval($data['co_payment_tier'] ?? 5);

    $sql = "INSERT INTO elders (name_chi, hkid, ccsv_number, co_payment_tier) VALUES ('$name_chi', '$hkid', '$ccsv_number', $tier)";
    
    if ($conn->query($sql) === TRUE) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'error' => $conn->error]);
    }
    exit;
}
?>