<?php
// backend/modules/movimientos/core/plan_saas.php
declare(strict_types=1);

/*
  Restricciones de medios de pago por plan SaaS en Movimientos.

  Regla actual:
  - Plan 1 / Básico: bloquea CHEQUE y ECHEQ.
  - Plan 2 / Pro/Avanzado: permite todos los medios.
  - Plan 3 / Demo: permite todos los medios, igual que Pro/Avanzado.

  Importante:
  DEMO siempre debe ganar. En algunas sesiones viejas puede venir idPlan=1,
  pero también plan_nivel=3, plan_nombre=DEMO o es_demo=1. En ese caso no
  debe comportarse como Básico.
*/

if (!function_exists('mv_plan_saas_normalize_text')) {
  function mv_plan_saas_normalize_text($value): string
  {
    if (is_array($value) || is_object($value)) {
      return '';
    }

    $s = trim((string)$value);
    if ($s === '') return '';

    $from = ['á','é','í','ó','ú','ü','ñ','Á','É','Í','Ó','Ú','Ü','Ñ'];
    $to   = ['a','e','i','o','u','u','n','A','E','I','O','U','U','N'];
    $s = str_replace($from, $to, $s);
    $s = function_exists('mb_strtoupper') ? mb_strtoupper($s, 'UTF-8') : strtoupper($s);
    $s = preg_replace('/[^A-Z0-9]+/u', ' ', $s) ?? $s;
    $s = preg_replace('/\s+/u', ' ', $s) ?? $s;
    return trim($s);
  }
}

if (!function_exists('mv_plan_saas_value_is_demo_flag')) {
  function mv_plan_saas_value_is_demo_flag($value): bool
  {
    if ($value === true) return true;
    if ($value === false || $value === null || $value === '') return false;

    $s = mv_plan_saas_normalize_text($value);
    return in_array($s, ['1', 'TRUE', 'SI', 'YES', 'DEMO'], true);
  }
}

if (!function_exists('mv_plan_saas_normalize_id')) {
  function mv_plan_saas_normalize_id($value): int
  {
    if ($value === null || $value === '') return 1;

    if (is_array($value)) {
      $idKeys = ['idPlan', 'id_plan', 'plan_id', 'planId', 'plan_nivel', 'nivel', 'nivel_plan'];
      foreach ($idKeys as $key) {
        if (array_key_exists($key, $value) && $value[$key] !== null && $value[$key] !== '') {
          return mv_plan_saas_normalize_id($value[$key]);
        }
      }

      $nameKeys = ['plan_nombre', 'nombre_plan', 'plan', 'tipo_plan', 'planName', 'nombrePlan', 'nombre'];
      foreach ($nameKeys as $key) {
        if (array_key_exists($key, $value) && $value[$key] !== null && $value[$key] !== '') {
          return mv_plan_saas_normalize_id($value[$key]);
        }
      }

      return 1;
    }

    $s = mv_plan_saas_normalize_text($value);

    if ($s !== '') {
      if (strpos($s, 'DEMO') !== false) return 3;
      if (strpos($s, 'PRO') !== false || strpos($s, 'AVANZADO') !== false || strpos($s, 'ADVANCED') !== false) return 2;
    }

    $n = (int)$value;
    if ($n === 3) return 3;
    if ($n === 2) return 2;
    return 1;
  }
}

if (!function_exists('mv_plan_saas_pick_values_from_source')) {
  function mv_plan_saas_pick_values_from_source($source, array $keys): array
  {
    if (!is_array($source)) return [];

    $values = [];
    foreach ($keys as $key) {
      if (array_key_exists($key, $source) && $source[$key] !== null && $source[$key] !== '') {
        $values[] = $source[$key];
      }
    }
    return $values;
  }
}

if (!function_exists('mv_plan_saas_id_actual')) {
  function mv_plan_saas_id_actual(): int
  {
    if (session_status() !== PHP_SESSION_ACTIVE) {
      // routes/api.php normalmente ya inició la sesión.
      // Evitamos forzar session_start si ya hubo salida.
      if (!headers_sent()) {
        @session_start();
      }
    }

    $idKeys = [
      'idPlan',
      'id_plan',
      'plan_id',
      'planId',
      'plan_nivel',
      'nivel',
      'nivel_plan',
      'tenant_idPlan',
      'tenant_id_plan',
      'idPlan_real',
      'id_plan_real',
      'plan_nivel_real',
    ];

    $nameKeys = [
      'plan_nombre',
      'nombre_plan',
      'plan',
      'tipo_plan',
      'planName',
      'nombrePlan',
      'plan_nombre_real',
      'nombre',
    ];

    $demoFlagKeys = [
      'es_demo',
      'demo',
      'is_demo',
      'modo_demo',
      'tenant_demo',
    ];

    $sources = [
      $_SESSION ?? [],
      is_array($_SESSION['usuario'] ?? null) ? $_SESSION['usuario'] : [],
      is_array($_SESSION['tenant'] ?? null) ? $_SESSION['tenant'] : [],
      is_array($_SESSION['plan_saas'] ?? null) ? $_SESSION['plan_saas'] : [],
      is_array($GLOBALS['AUTH_USER'] ?? null) ? $GLOBALS['AUTH_USER'] : [],
      is_array($GLOBALS['AUTH_TENANT'] ?? null) ? $GLOBALS['AUTH_TENANT'] : [],
      is_array($GLOBALS['AUTH_PLAN'] ?? null) ? $GLOBALS['AUTH_PLAN'] : [],
    ];

    $idCandidates = [
      $GLOBALS['AUTH_PLAN_ID'] ?? null,
      $GLOBALS['idPlan'] ?? null,
      $_SERVER['HTTP_X_PLAN'] ?? null,
      $_SERVER['HTTP_X_PLAN_ID'] ?? null,
      $_SERVER['HTTP_X_PLAN_NIVEL'] ?? null,
    ];

    $nameCandidates = [
      $_SERVER['HTTP_X_PLAN_NAME'] ?? null,
      $_SERVER['HTTP_X_PLAN_NOMBRE'] ?? null,
    ];

    $demoFlagCandidates = [
      $_SERVER['HTTP_X_DEMO'] ?? null,
      $_SERVER['HTTP_X_IS_DEMO'] ?? null,
    ];

    foreach ($sources as $source) {
      $idCandidates = array_merge($idCandidates, mv_plan_saas_pick_values_from_source($source, $idKeys));
      $nameCandidates = array_merge($nameCandidates, mv_plan_saas_pick_values_from_source($source, $nameKeys));
      $demoFlagCandidates = array_merge($demoFlagCandidates, mv_plan_saas_pick_values_from_source($source, $demoFlagKeys));

      // Compatibilidad con estructuras anidadas comunes.
      if (isset($source['tenant']) && is_array($source['tenant'])) {
        $idCandidates = array_merge($idCandidates, mv_plan_saas_pick_values_from_source($source['tenant'], $idKeys));
        $nameCandidates = array_merge($nameCandidates, mv_plan_saas_pick_values_from_source($source['tenant'], $nameKeys));
        $demoFlagCandidates = array_merge($demoFlagCandidates, mv_plan_saas_pick_values_from_source($source['tenant'], $demoFlagKeys));
      }

      if (isset($source['plan_saas']) && is_array($source['plan_saas'])) {
        $idCandidates = array_merge($idCandidates, mv_plan_saas_pick_values_from_source($source['plan_saas'], $idKeys));
        $nameCandidates = array_merge($nameCandidates, mv_plan_saas_pick_values_from_source($source['plan_saas'], $nameKeys));
        $demoFlagCandidates = array_merge($demoFlagCandidates, mv_plan_saas_pick_values_from_source($source['plan_saas'], $demoFlagKeys));
      }
    }

    // DEMO siempre gana, incluso si por compatibilidad también viene idPlan=1.
    foreach ($demoFlagCandidates as $value) {
      if (mv_plan_saas_value_is_demo_flag($value)) return 3;
    }

    foreach ($idCandidates as $value) {
      if ($value === null || $value === '') continue;
      if (mv_plan_saas_normalize_id($value) === 3) return 3;
    }

    foreach ($nameCandidates as $value) {
      if ($value === null || $value === '') continue;
      if (mv_plan_saas_normalize_id($value) === 3) return 3;
    }

    // Pro/Avanzado permite todos los medios. Solo si no es Demo, evaluamos Pro.
    foreach ($idCandidates as $value) {
      if ($value === null || $value === '') continue;
      if (mv_plan_saas_normalize_id($value) === 2) return 2;
    }

    foreach ($nameCandidates as $value) {
      if ($value === null || $value === '') continue;
      if (mv_plan_saas_normalize_id($value) === 2) return 2;
    }

    // Si por algún motivo no llegó el plan, se toma como básico por seguridad.
    return 1;
  }
}

if (!function_exists('mv_plan_saas_es_basico')) {
  function mv_plan_saas_es_basico(): bool
  {
    return mv_plan_saas_id_actual() === 1;
  }
}

if (!function_exists('mv_plan_saas_es_demo')) {
  function mv_plan_saas_es_demo(): bool
  {
    return mv_plan_saas_id_actual() === 3;
  }
}

if (!function_exists('mv_plan_saas_es_pro_o_demo')) {
  function mv_plan_saas_es_pro_o_demo(): bool
  {
    $planId = mv_plan_saas_id_actual();
    return $planId === 2 || $planId === 3;
  }
}

if (!function_exists('mv_plan_saas_medio_pago_es_cheque_o_echeq')) {
  function mv_plan_saas_medio_pago_es_cheque_o_echeq($nombre): bool
  {
    $s = mv_plan_saas_normalize_text($nombre);
    if ($s === '') return false;

    return $s === 'CHEQUE'
      || $s === 'ECHEQ'
      || $s === 'E CHEQ'
      || strpos($s, 'CHEQUE') !== false
      || strpos($s, 'ECHEQ') !== false
      || strpos($s, 'E CHEQ') !== false;
  }
}

if (!function_exists('mv_plan_saas_medio_pago_bloqueado')) {
  function mv_plan_saas_medio_pago_bloqueado($nombre): bool
  {
    // Solo el plan Básico bloquea CHEQUE/ECHEQ.
    // DEMO y PRO/AVANZADO permiten todos los medios.
    return mv_plan_saas_es_basico() && mv_plan_saas_medio_pago_es_cheque_o_echeq($nombre);
  }
}

if (!function_exists('mv_plan_saas_error_medio_pago_bloqueado')) {
  function mv_plan_saas_error_medio_pago_bloqueado(): string
  {
    return 'Tu plan BÁSICO no permite usar CHEQUE ni ECHEQ como medio de pago. Para usarlos necesitás el plan PRO.';
  }
}
