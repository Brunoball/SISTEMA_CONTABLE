<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class RoutesRequireTest extends TestCase
{
    /**
     * 🔍 Verifica que todos los require / require_once
     * en los route.php apunten a archivos existentes
     */
    public function test_routes_require_existing_files(): void
    {
        $modulesDir = __DIR__ . '/../modules';

        foreach (glob($modulesDir . '/*/route.php') as $routeFile) {
            $content = file_get_contents($routeFile);

            preg_match_all(
                '/require(?:_once)?\s*\(?\s*__DIR__\s*\.\s*[\'"]([^\'"]+)[\'"]\s*\)?\s*;/',
                $content,
                $matches
            );

            foreach ($matches[1] as $relativePath) {
                $fullPath = realpath(dirname($routeFile) . '/' . $relativePath);

                $this->assertNotFalse(
                    $fullPath,
                    "❌ Require roto en:\n$routeFile\n→ Archivo no encontrado: $relativePath"
                );
            }
        }

        $this->assertTrue(true);
    }
}