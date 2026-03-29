<?php
declare(strict_types=1);

date_default_timezone_set('America/Argentina/Cordoba');

$autoloadPath = __DIR__ . '/../../vendor/autoload.php';
if (is_file($autoloadPath)) {
    require_once $autoloadPath;
}

if (!class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
    $phpMailerBase = __DIR__ . '/../../vendor/phpmailer/phpmailer/';
    foreach (['Exception.php', 'PHPMailer.php', 'SMTP.php'] as $f) {
        if (is_file($phpMailerBase . $f)) require_once $phpMailerBase . $f;
    }
}

if (!class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
    throw new RuntimeException('PHPMailer no pudo cargarse.');
}

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

function _mail_valido(string $email): bool
{
    return (bool) filter_var($email, FILTER_VALIDATE_EMAIL);
}

function _get_mail_cfg(): array
{
    static $cfg = null;
    if ($cfg !== null) return $cfg;

    $configPath = __DIR__ . '/config_mail.php';
    if (!is_file($configPath)) {
        throw new RuntimeException('Falta config_mail.php');
    }
    // Carga SIEMPRE fresca usando include (no require_once)
    $cfg = include $configPath;
    if (!is_array($cfg)) {
        throw new RuntimeException('config_mail.php no retorna un array válido.');
    }
    return $cfg;
}

if (!function_exists('enviar_mail')) {
    function enviar_mail(
        string $toEmail,
        ?string $toName,
        string $subject,
        string $htmlBody,
        ?string $altBody = null,
        array $opts = []
    ): array {
        if (!_mail_valido($toEmail)) {
            return ['exito' => false, 'error' => 'Email destino inválido'];
        }

        try {
            $MAILCFG = _get_mail_cfg();
        } catch (Throwable $e) {
            return ['exito' => false, 'error' => 'Config mail no disponible: ' . $e->getMessage()];
        }

        $mail = new PHPMailer(true);

        try {
            $mail->isSMTP();
            $mail->Host          = (string)($MAILCFG['host'] ?? 'smtp.hostinger.com');
            $mail->SMTPAuth      = (bool)($MAILCFG['auth'] ?? true);
            $mail->Username      = (string)($MAILCFG['username'] ?? '');
            $mail->Password      = (string)($MAILCFG['password'] ?? '');
            $mail->Port          = (int)($MAILCFG['port'] ?? 465);
            $mail->CharSet       = 'UTF-8';
            $mail->Timeout       = 20;
            $mail->SMTPKeepAlive = false;
            $mail->SMTPAutoTLS   = true;

            $secure = strtolower(trim((string)($MAILCFG['secure'] ?? 'ssl')));
            $mail->SMTPSecure = ($secure === 'tls')
                ? PHPMailer::ENCRYPTION_STARTTLS
                : PHPMailer::ENCRYPTION_SMTPS;

            if (method_exists($mail, 'setLanguage')) {
                $mail->setLanguage('es');
            }

            $fromEmail = (string)($MAILCFG['from_email'] ?? $MAILCFG['username'] ?? '');
            $fromName  = (string)($MAILCFG['from_name'] ?? 'Balto');

            if (!_mail_valido($fromEmail)) {
                return ['exito' => false, 'error' => 'From inválido: "' . $fromEmail . '"'];
            }

            $mail->setFrom($fromEmail, $fromName);
            $mail->Sender = $fromEmail;

            if (
                !empty($MAILCFG['reply_to']['correo']) &&
                _mail_valido((string)$MAILCFG['reply_to']['correo'])
            ) {
                $mail->addReplyTo(
                    (string)$MAILCFG['reply_to']['correo'],
                    (string)($MAILCFG['reply_to']['nombre'] ?? '')
                );
            }

            $mail->addAddress($toEmail, $toName ?? '');

            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body    = $htmlBody;
            $mail->AltBody = $altBody ?? trim(strip_tags($htmlBody));

            $mail->addCustomHeader('X-Mailer', 'Balto');
            $mail->addCustomHeader('X-Priority', '3');

            $mail->send();
            return ['exito' => true];

        } catch (Exception $e) {
            error_log('[MAIL BALTO] ' . $mail->ErrorInfo);
            return ['exito' => false, 'error' => $mail->ErrorInfo ?: $e->getMessage()];
        } catch (Throwable $e) {
            error_log('[MAIL BALTO] ' . $e->getMessage());
            return ['exito' => false, 'error' => $e->getMessage()];
        }
    }
}