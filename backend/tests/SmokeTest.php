<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

final class SmokeTest extends TestCase
{
    private string $router;
    private string $php;

    protected function setUp(): void
    {
        $this->router = realpath(__DIR__ . '/../routes/api.php');
        $this->php = PHP_BINARY;

        $this->assertFileExists($this->router);
        $this->assertFileExists($this->php);
    }

    /**
     * Smoke test mínimo:
     * - ejecuta router
     * - GET y POST
     * - NO valida JSON
     * - solo que no crashee
     */
    public function test_backend_router_does_not_crash(): void
    {
        // ---------- GET ----------
        $cmdGet = sprintf(
            '%s -r %s 2> NUL',
            escapeshellarg($this->php),
            escapeshellarg(
                '$_GET=array("action"=>"ping"); $_POST=array(); $_REQUEST=$_GET; $_SERVER["REQUEST_METHOD"]="GET"; require "' . $this->router . '";'
            )
        );

        $outGet = shell_exec($cmdGet);
        $this->assertNotNull($outGet, 'GET crasheó');

        // ---------- POST ----------
        $cmdPost = sprintf(
            '%s -r %s 2> NUL',
            escapeshellarg($this->php),
            escapeshellarg(
                '$_POST=array("action"=>"ping"); $_GET=array(); $_REQUEST=$_POST; $_SERVER["REQUEST_METHOD"]="POST"; require "' . $this->router . '";'
            )
        );

        $outPost = shell_exec($cmdPost);
        $this->assertNotNull($outPost, 'POST crasheó');
    }
}