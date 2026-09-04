<?php
require_once __DIR__ . '/db.php';
header('Content-Type: application/json; charset=utf-8');

function normalize_phrase(string $phrase): string {
    $clean = mb_strtolower(trim($phrase));
    $clean = preg_replace('/\s+/', ' ', $clean);
    return $clean;
}

function compute_weighted_score(int $reportCount, int $uniqueDeviceCount, int $baseScore = 1): float {
    $score = $baseScore + log(max(1, $reportCount + $uniqueDeviceCount * 1.4)) * 1.8;
    return min(10.0, round($score, 2));
}

function compute_threat_level(float $weightedScore): string {
    if ($weightedScore >= 7.0) {
        return 'High Threat';
    }
    if ($weightedScore >= 3.0) {
        return 'Low Threat';
    }
    return 'Safe';
}

$body = json_decode(file_get_contents('php://input'), true);
if (empty($body['phrase']) || empty($body['device_id'])) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Missing phrase or device_id']);
    exit;
}

$phrase = trim($body['phrase']);
$cleanedPhrase = normalize_phrase($phrase);
$deviceId = trim($body['device_id']);
$userPhone = isset($body['user_phone']) ? trim($body['user_phone']) : null;
$sourcePackage = isset($body['sourcePackage']) ? trim($body['sourcePackage']) : null;
$timestamp = date('Y-m-d H:i:s');

try {
    $db = get_db_connection();
    $db->beginTransaction();

    $lookup = $db->prepare('SELECT * FROM threat_matrix WHERE cleaned_phrase = :cleaned_phrase LIMIT 1');
    $lookup->execute([':cleaned_phrase' => $cleanedPhrase]);
    $existing = $lookup->fetch();

    if ($existing) {
        $reportCount = (int)$existing['report_count'] + 1;

        $deviceCheck = $db->prepare('SELECT COUNT(1) AS device_count FROM phrase_reports WHERE cleaned_phrase = :cleaned_phrase AND device_id = :device_id');
        $deviceCheck->execute([':cleaned_phrase' => $cleanedPhrase, ':device_id' => $deviceId]);
        $deviceUnique = $deviceCheck->fetchColumn() == 0;

        if ($deviceUnique) {
            $insertReport = $db->prepare('INSERT INTO phrase_reports (cleaned_phrase, device_id, reported_at, source_package) VALUES (:cleaned_phrase, :device_id, :reported_at, :source_package)');
            $insertReport->execute([
                ':cleaned_phrase' => $cleanedPhrase,
                ':device_id' => $deviceId,
                ':reported_at' => $timestamp,
                ':source_package' => $sourcePackage
            ]);
        }

        $uniqueDeviceCount = (int)$db->query('SELECT COUNT(DISTINCT device_id) FROM phrase_reports WHERE cleaned_phrase = ' . $db->quote($cleanedPhrase))->fetchColumn();
        $uniqueDeviceCount = max($uniqueDeviceCount, 1);
        $weightedScore = compute_weighted_score($reportCount, $uniqueDeviceCount, (int)$existing['base_score']);
        $threatLevel = compute_threat_level($weightedScore);

        $update = $db->prepare('UPDATE threat_matrix SET report_count = :report_count, unique_device_count = :unique_device_count, weighted_score = :weighted_score, threat_level = :threat_level, last_seen = :last_seen WHERE id = :id');
        $update->execute([
            ':report_count' => $reportCount,
            ':unique_device_count' => $uniqueDeviceCount,
            ':weighted_score' => $weightedScore,
            ':threat_level' => $threatLevel,
            ':last_seen' => $timestamp,
            ':id' => $existing['id'],
        ]);

        $response = [
            'status' => 'updated',
            'phrase_id' => $existing['id'],
            'report_count' => $reportCount,
            'unique_device_count' => $uniqueDeviceCount,
            'weighted_score' => $weightedScore,
            'threat_level' => $threatLevel,
            'verified' => (bool)$existing['verified'],
        ];
    } else {
        $baseScore = 1;
        $weightedScore = compute_weighted_score(1, 1, $baseScore);
        $threatLevel = compute_threat_level($weightedScore);

        $insert = $db->prepare('INSERT INTO threat_matrix (phrase, cleaned_phrase, report_count, unique_device_count, base_score, weighted_score, threat_level, verified, status, first_seen, last_seen) VALUES (:phrase, :cleaned_phrase, 1, 1, :base_score, :weighted_score, :threat_level, 0, "pending", :first_seen, :last_seen)');
        $insert->execute([
            ':phrase' => $phrase,
            ':cleaned_phrase' => $cleanedPhrase,
            ':base_score' => $baseScore,
            ':weighted_score' => $weightedScore,
            ':threat_level' => $threatLevel,
            ':first_seen' => $timestamp,
            ':last_seen' => $timestamp,
        ]);
        $newId = $db->lastInsertId();

        $insertReport = $db->prepare('INSERT INTO phrase_reports (cleaned_phrase, device_id, reported_at, source_package) VALUES (:cleaned_phrase, :device_id, :reported_at, :source_package)');
        $insertReport->execute([
            ':cleaned_phrase' => $cleanedPhrase,
            ':device_id' => $deviceId,
            ':reported_at' => $timestamp,
            ':source_package' => $sourcePackage
        ]);

        $response = [
            'status' => 'created',
            'phrase_id' => $newId,
            'report_count' => 1,
            'unique_device_count' => 1,
            'weighted_score' => $weightedScore,
            'threat_level' => $threatLevel,
            'verified' => false,
        ];
    }

    if ($userPhone) {
        $upsertUser = $db->prepare('INSERT INTO users (supabase_user_id, phone, verified_at, last_seen) VALUES (:supabase_user_id, :phone, :verified_at, :last_seen) ON DUPLICATE KEY UPDATE last_seen = :last_seen');
        $upsertUser->execute([
            ':supabase_user_id' => $body['user_id'] ?? null,
            ':phone' => $userPhone,
            ':verified_at' => $timestamp,
            ':last_seen' => $timestamp,
        ]);
    }

    $db->commit();
    echo json_encode($response);
} catch (Exception $ex) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $ex->getMessage()]);
}
