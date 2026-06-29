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
        // subimos hasta /home/.../domains/DOMINIO y usamos /balto_private
        $projectRoot = arca_project_root();
        $domainRoot = dirname(dirname($projectRoot));
        return $domainRoot . '/balto_private';
    }
}

if (!function_exists('arca_first_valid_tenant_id')) {
    function arca_first_valid_tenant_id(array $candidates): int
    {
        foreach ($candidates as $candidate) {
            $digits = arca_only_digits((string)$candidate);
            if ($digits !== '') {
                $id = (int)$digits;
                if ($id > 0) {
                    return $id;
                }
            }
        }

        return 0;
    }
}

if (!function_exists('arca_get_current_tenant_id')) {
    function arca_get_current_tenant_id(): int
    {
        $candidates = [];

        // 1) Fuente principal: sesión master validada por backend/routes/api.php.
        // NO tomar X-IdTenant del frontend, porque eso permitiría elegir manualmente
        // otra carpeta privada de ARCA.
        $candidates[] = $GLOBALS['AUTH_TENANT_ID'] ?? '';

        if (isset($GLOBALS['SESSION_MASTER']) && is_array($GLOBALS['SESSION_MASTER'])) {
            $candidates[] = $GLOBALS['SESSION_MASTER']['idTenant'] ?? '';
            $candidates[] = $GLOBALS['SESSION_MASTER']['id_tenant'] ?? '';
            $candidates[] = $GLOBALS['SESSION_MASTER']['tenant_id'] ?? '';
        }

        // 2) Tenant resuelto por tenant_resolver.php si ya corrió.
        if (isset($GLOBALS['tenant']) && is_array($GLOBALS['tenant'])) {
            $candidates[] = $GLOBALS['tenant']['idTenant'] ?? '';
            $candidates[] = $GLOBALS['tenant']['id_tenant'] ?? '';
            $candidates[] = $GLOBALS['tenant']['tenant_id'] ?? '';
        }

        if (isset($GLOBALS['currentTenant']) && is_array($GLOBALS['currentTenant'])) {
            $candidates[] = $GLOBALS['currentTenant']['idTenant'] ?? '';
            $candidates[] = $GLOBALS['currentTenant']['id_tenant'] ?? '';
            $candidates[] = $GLOBALS['currentTenant']['tenant_id'] ?? '';
        }

        // 3) Sesión PHP seteada por api.php después de validar X-Session.
        if (session_status() === PHP_SESSION_ACTIVE) {
            $candidates[] = $_SESSION['idTenant'] ?? '';
            $candidates[] = $_SESSION['id_tenant'] ?? '';
            $candidates[] = $_SESSION['tenant_id'] ?? '';
        }

        return arca_first_valid_tenant_id($candidates);
    }
}

if (!function_exists('arca_assert_inside_base')) {
    function arca_assert_inside_base(string $base, string $dir): string
    {
        $realBase = realpath($base);
        $realDir  = realpath($dir);

        if ($realBase === false || !is_dir($realBase)) {
            throw new RuntimeException('No existe la carpeta base privada de ARCA: ' . $base);
        }

        if ($realDir === false || !is_dir($realDir)) {
            throw new RuntimeException('No existe la carpeta privada de ARCA: ' . $dir);
        }

        $realBaseNorm = rtrim(str_replace('\\', '/', $realBase), '/') . '/';
        $realDirNorm  = rtrim(str_replace('\\', '/', $realDir), '/') . '/';

        if (strpos($realDirNorm, $realBaseNorm) !== 0) {
            throw new RuntimeException('Ruta privada inválida para ARCA.');
        }

        return rtrim($realDir, '/\\');
    }
}

if (!function_exists('arca_get_tenant_private_dir')) {
    function arca_get_tenant_private_dir(?int $tenantId = null): string
    {
        $tenantId = $tenantId ?? arca_get_current_tenant_id();
        if ($tenantId <= 0) {
            throw new RuntimeException('No se pudo resolver el idTenant actual desde la sesión validada.');
        }

        $base = arca_private_root() . '/balto_arca_clientes';
        $dir = $base . '/t_' . $tenantId;

        return arca_assert_inside_base($base, $dir);
    }
}

if (!function_exists('arca_extract_cuit_from_cert_file')) {
    function arca_extract_cuit_from_cert_file(string $certPath): string
    {
        if (!is_file($certPath)) {
            return '';
        }

        try {
            $certRaw = @file_get_contents($certPath);
            if ($certRaw === false || $certRaw === '') {
                return '';
            }
            $certData = @openssl_x509_parse($certRaw);
            if (!is_array($certData)) {
                return '';
            }
            $subject = isset($certData['subject']) && is_array($certData['subject']) ? $certData['subject'] : [];
            foreach ([(string)($subject['CN'] ?? ''), (string)($subject['serialNumber'] ?? '')] as $field) {
                $digits = arca_only_digits($field);
                if (strlen($digits) === 11) {
                    return $digits;
                }
            }
        } catch (Throwable $e) {
            return '';
        }

        return '';
    }
}

if (!function_exists('arca_read_cuit_from_dir')) {
    function arca_read_cuit_from_dir(string $dir): string
    {
        $cuitFile = rtrim($dir, '/\\') . '/arca_cuit.txt';
        if (is_file($cuitFile)) {
            $digits = arca_only_digits(trim((string)@file_get_contents($cuitFile)));
            if (strlen($digits) === 11) {
                return $digits;
            }
        }

        return arca_extract_cuit_from_cert_file(rtrim($dir, '/\\') . '/arca_cert.pem');
    }
}

if (!function_exists('arca_get_tenant_account_private_dir')) {
    function arca_get_tenant_account_private_dir(?int $tenantId = null, string $cuit = ''): string
    {
        $tenantDir = arca_get_tenant_private_dir($tenantId);
        $cuit = arca_only_digits($cuit);

        // Compatibilidad: si no se pide CUIT emisor, se usa la carpeta legacy t_ID.
        if ($cuit === '') {
            return $tenantDir;
        }

        $candidateNames = [$cuit, 'cuit_' . $cuit, 'CUIT_' . $cuit];
        foreach ($candidateNames as $name) {
            $dir = $tenantDir . '/' . $name;
            if (is_dir($dir)) {
                return arca_assert_inside_base($tenantDir, $dir);
            }
        }

        // Compatibilidad: si el CUIT seleccionado es el mismo que está cargado en la raíz t_ID,
        // se permite seguir usando la estructura vieja sin subcarpeta.
        $legacyCuit = arca_read_cuit_from_dir($tenantDir);
        if ($legacyCuit !== '' && $legacyCuit === $cuit) {
            return $tenantDir;
        }

        throw new RuntimeException(
            'No existe carpeta privada ARCA para el CUIT emisor ' . $cuit .
            '. Creá la carpeta: ' . $tenantDir . '/' . $cuit .
            ' y colocá adentro arca_cert.pem, arca_key.pem, arca_key.pass, cacert.pem, personaServiceA5.wsdl, personaServiceA13.wsdl y wsfev1.wsdl.'
        );
    }
}
