<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class LintTest extends TestCase
{
    /**
     * 🔍 Lint de todos los PHP del backend
     * Detecta:
     * - archivo exacto
     * - línea exacta
     * - parse errors reales
     */
    public function test_no_php_syntax_errors(): void
    {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator(__DIR__ . '/..')
        );

        foreach ($files as $file) {
            if (!$file->isFile()) continue;
            if ($file->getExtension() !== 'php') continue;

            $path = $file->getRealPath();

            // Saltamos vendor y tests
            if (str_contains($path, 'vendor')) continue;
            if (str_contains($path, 'tests')) continue;

            $cmd = sprintf(
                '%s -l %s 2>&1',
                escapeshellarg(PHP_BINARY),
                escapeshellarg($path)
            );

            $output = shell_exec($cmd);

            if (!str_contains($output, 'No syntax errors detected')) {
                $this->fail("❌ Error de sintaxis detectado:\n" . $output);
            }
        }

        $this->assertTrue(true);
    }
}