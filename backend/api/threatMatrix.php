<?php
require_once __DIR__ . '/db.php';
header('Content-Type: application/json; charset=utf-8');

try {
    $db = get_db_connection();
    $stmt = $db->prepare('SELECT id, phrase, cleaned_phrase, report_count, unique_device_count, base_score, weighted_score, threat_level, verified, status, first_seen, last_seen FROM threat_matrix WHERE status != :rejected ORDER BY weighted_score DESC, last_seen DESC LIMIT 1000');
    $stmt->execute([':rejected' => 'rejected']);
    $rows = $stmt->fetchAll();

    echo json_encode([
        'status' => 'ok',
        'data' => $rows,
        'served_at' => date('c'),
        'count' => count($rows),
    ]);
} catch (Exception $ex) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $ex->getMessage()]);
}
