<?php
declare(strict_types=1);

/**
 * auditoria(id_auditoria, idUsuario, modulo, accion, entidad, detalle, ip, user_agent, created_at)
 * - detalle guardado como STRING JSON (sirve igual para leerlo luego)
 * - sin CAST AS JSON (compatibilidad Hostinger/MariaDB)
 */
function auditar(
  PDO $pdo,
  int $idUsuario,
  string $modulo,
  string $accion,
  ?string $entidad = null,
  $idEntidad = null,
  $detalle = null
): void {
  try {
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;

    $payload = [
      'idEntidad' => $idEntidad,
      'data' => $detalle,
    ];

    $jsonDetalle = json_encode($payload, JSON_UNESCAPED_UNICODE);

    $sql = "INSERT INTO auditoria (idUsuario, modulo, accion, entidad, detalle, ip, user_agent)
            VALUES (:idUsuario, :modulo, :accion, :entidad, :detalle, :ip, :ua)";
    $st = $pdo->prepare($sql);
    $st->execute([
      ':idUsuario' => $idUsuario,
      ':modulo' => $modulo,
      ':accion' => $accion,
      ':entidad' => $entidad,
      ':detalle' => $jsonDetalle,
      ':ip' => $ip,
      ':ua' => $ua,
    ]);
  } catch (Throwable $e) {
    // NUNCA romper el sistema por auditoría
  }
}
