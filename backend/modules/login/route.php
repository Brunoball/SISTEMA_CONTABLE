<?php
// backend/modules/login/route.php
declare(strict_types=1);

/**
 * Pequeño router SOLO para el módulo de LOGIN.
 *
 * Devuelve true si manejó la acción, false si no le corresponde.
 * api.php se encarga de los headers y del try/catch general.
 */
function route_login(string $action): bool
{
    switch ($action) {
        case 'inicio':
            require __DIR__ . '/inicio.php';
            return true;

        case 'registro':
            require __DIR__ . '/registro.php';
            return true;

        default:
            // Esta acción no es del módulo login
            return false;
    }
}
