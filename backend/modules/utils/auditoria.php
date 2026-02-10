<?php
declare(strict_types=1);

/**
 * AUDITORÍA (tenant DB: sistema_contable)
 *
 * ✅ Guarda idUsuarioMaster (de balto_master.usuarios_master)
 * ✅ detalle como STRING JSON (compat Hostinger/MariaDB)
 * ✅ Nunca rompe el sistema si falla
 *
 * Estructura esperada en sistema_contable.auditoria:
 * - id_auditoria (AI)
 * - idUsuarioMaster (INT UNSIGNED)
 * - idTenant (INT UNSIGNED, NULL)   [opcional]
 * - modulo, accion, entidad
 * - detalle (LONGTEXT/TEXT)
 * - ip, user_agent
 * - created_at (DEFAULT CURRENT_TIMESTAMP)
 */

/**
 * @param PDO $pdo                    Conexión a la DB del tenant (sistema_contable)
 * @param int $idUsuarioMaster         ID del usuario MASTER (balto_master.usuarios_master.idUsuarioMaster)
 *                                    (Compat: si te llega idUsuario antiguo, se usa igual como "master")
 * @param string $modulo
 * @param string $accion
 * @param string|null $entidad
 * @param mixed $idEntidad
 * @param mixed $detalle
 * @param int|null $idTenant           (opcional) para trazabilidad SaaS
 */
function auditar(
  PDO $pdo,
  int $idUsuarioMaster,
  string $modulo,
  string $accion,
  ?string $entidad = null,
  $idEntidad = null,
  $detalle = null,
  ?int $idTenant = null
): void {
  try {
    // Si no hay usuario master, no auditamos
    if ($idUsuarioMaster <= 0) return;

    $ip = $_SERVER['HTTP_CF_CONNECTING_IP']
      ?? $_SERVER['HTTP_X_FORWARDED_FOR']
      ?? $_SERVER['REMOTE_ADDR']
      ?? null;

    if (is_string($ip) && str_contains($ip, ',')) {
      $ip = trim(explode(',', $ip)[0]);
    }

    $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;

    $payload = [
      'idEntidad' => $idEntidad,
      'data' => $detalle,
    ];

    $jsonDetalle = json_encode($payload, JSON_UNESCAPED_UNICODE);

    // ✅ Insert con idUsuarioMaster (+ idTenant opcional)
    $sql = "INSERT INTO auditoria
              (idUsuarioMaster, idTenant, modulo, accion, entidad, detalle, ip, user_agent)
            VALUES
              (:idUsuarioMaster, :idTenant, :modulo, :accion, :entidad, :detalle, :ip, :ua)";

    $st = $pdo->prepare($sql);
    $st->execute([
      ':idUsuarioMaster' => $idUsuarioMaster,
      ':idTenant' => $idTenant,
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
