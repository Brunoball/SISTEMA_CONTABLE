<?php
// tests/bootstrap.php

putenv('APP_ENV=test');
$_ENV['APP_ENV'] = 'test';
$_SERVER['APP_ENV'] = 'test';

require __DIR__ . '/../vendor/autoload.php';
