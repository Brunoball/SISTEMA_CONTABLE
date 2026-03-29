<?php
declare(strict_types=1);

if (!function_exists('arca_only_digits')) {
    function arca_only_digits($v): string
    {
        $out = preg_replace('/\D+/', '', (string)$v);
        return $out ?? '';
    }
}

if (!function_exists('arca_project_root')) {
    function arca_project_root(): string
    {
        // Ajustá esta subida de niveles según tu estructura real
        // facturacion -> movimientos -> modules -> api -> BALTO
        return dirname(__DIR__, 4);
    }
}

if (!function_exists('arca_private_root')) {
    function arca_private_root(): string
    {
        $env = (string)($_ENV['BALTO_PRIVATE_ROOT'] ?? getenv('BALTO_PRIVATE_ROOT') ?: '');
        if ($env !== '') {
            return rtrim($env, '/\\');
        }

        // Ejemplo:
        // /home/.../public_html/BALTO/api/modules/movimientos/facturacion
        // subimos hasta /home/.../domains/3devsnet.com
        $projectRoot = arca_project_root();
        $domainRoot = dirname(dirname($projectRoot)); 
        return $domainRoot . '/balto_private';
    }
}

if (!function_exists('arca_get_current_tenant_id')) {
    function arca_get_current_tenant_id(): int
    {
        // 1) header explícito
        $headerTenant =
            $_SERVER['HTTP_X_IDTENANT'] ??
            $_SERVER['HTTP_X_ID_TENANT'] ??
            '';

        $headerTenant = arca_only_digits((string)$headerTenant);
        if ($headerTenant !== '') {
            return (int)$headerTenant;
        }

        // 2) variable global seteada por tu auth / tenant_resolver
        if (isset($GLOBALS['tenant']) && is_array($GLOBALS['tenant'])) {
            $id = arca_only_digits((string)($GLOBALS['tenant']['idTenant'] ?? ''));
            if ($id !== '') {
                return (int)$id;
            }
        }

        if (isset($GLOBALS['currentTenant']) && is_array($GLOBALS['currentTenant'])) {
            $id = arca_only_digits((string)($GLOBALS['currentTenant']['idTenant'] ?? ''));
            if ($id !== '') {
                return (int)$id;
            }
        }

        // 3) sesión PHP si la usás
        if (session_status() === PHP_SESSION_ACTIVE) {
            $id = arca_only_digits((string)($_SESSION['idTenant'] ?? $_SESSION['tenant_id'] ?? ''));
            if ($id !== '') {
                return (int)$id;
            }
        }

        return 0;
    }
}

if (!function_exists('arca_get_tenant_private_dir')) {
    function arca_get_tenant_private_dir(?int $tenantId = null): string
    {
        $tenantId = $tenantId ?? arca_get_current_tenant_id();
        if ($tenantId <= 0) {
            throw new RuntimeException('No se pudo resolver el idTenant actual.');
        }

        $base = arca_private_root() . '/balto_arca_clientes';
        $dir = $base . '/t_' . $tenantId;

        $realBase = realpath($base);
        $realDir  = realpath($dir);

        if ($realBase === false) {
            throw new RuntimeException('No existe la carpeta base privada de ARCA: ' . $base);
        }

        if ($realDir === false || !is_dir($realDir)) {
            throw new RuntimeException('No existe la carpeta privada del tenant: ' . $dir);
        }

        // seguridad extra: verificar que esté dentro de la base privada
        $realBaseNorm = rtrim(str_replace('\\', '/', $realBase), '/') . '/';
        $realDirNorm  = rtrim(str_replace('\\', '/', $realDir), '/') . '/';

        if (strpos($realDirNorm, $realBaseNorm) !== 0) {
            throw new RuntimeException('Ruta privada inválida para el tenant.');
        }

        return rtrim($realDir, '/\\');
    }
}