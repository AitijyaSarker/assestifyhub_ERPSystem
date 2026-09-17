$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Test-PortOpen([int]$Port) {
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        return ($null -ne $connection)
    }
    catch {
        return $false
    }
}

function Wait-Port([int]$Port, [int]$TimeoutSeconds = 60) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortOpen $Port) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Wait-Http([string]$Url, [int]$TimeoutSeconds = 90) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
        }
        catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

if (-not (Test-Path '.env')) {
    if (Test-Path '.env.example') {
        Copy-Item '.env.example' '.env'
    }
    else {
        Write-Host 'Missing .env.example. Cannot continue.' -ForegroundColor Red
        Read-Host 'Press Enter to exit'
        exit 1
    }
}

$dockerAvailable = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerAvailable) {
    Write-Host 'Docker is not installed or not on PATH.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}

if (-not (Test-PortOpen 55432) -or -not (Test-PortOpen 6379)) {
    Write-Host 'Starting PostgreSQL and Redis...' -ForegroundColor Cyan
    docker compose up -d postgres redis
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Docker startup failed.' -ForegroundColor Red
        Read-Host 'Press Enter to exit'
        exit 1
    }
}

if (-not (Wait-Port 55432) -or -not (Wait-Port 6379)) {
    Write-Host 'Database services did not become ready in time.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}

if (-not (Test-Path 'node_modules')) {
    Write-Host 'Installing dependencies...' -ForegroundColor Cyan
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}

if (-not (Test-PortOpen 4000)) {
    Write-Host 'Preparing database...' -ForegroundColor Cyan
    $env:DATABASE_URL = 'postgresql://erp:erp_dev_password@localhost:55432/erp_pos?schema=public'
    $env:REDIS_URL = 'redis://localhost:6379'
    $env:FRONTEND_ORIGIN = 'http://localhost:3000'
    npm run prisma:migrate:deploy -w @erp/api
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
    npm run db:generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma client generation failed.' }
    npm run db:seed
    if ($LASTEXITCODE -ne 0) { throw 'Database seed failed.' }

    if (-not (Test-Path 'apps\api\dist\apps\api\src\main.js')) {
        Write-Host 'Building API...' -ForegroundColor Cyan
        npm run build -w @erp/api
        if ($LASTEXITCODE -ne 0) { throw 'API build failed.' }
    }

    Write-Host 'Starting API server...' -ForegroundColor Cyan
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$PSScriptRoot'; `$env:DATABASE_URL='postgresql://erp:erp_dev_password@localhost:55432/erp_pos?schema=public'; `$env:REDIS_URL='redis://localhost:6379'; `$env:FRONTEND_ORIGIN='http://localhost:3000'; node apps/api/dist/apps/api/src/main.js"
}
else {
    Write-Host 'API already appears to be running.' -ForegroundColor Yellow
}

if (-not (Test-PortOpen 3000)) {
    Write-Host 'Starting web app...' -ForegroundColor Cyan
    Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$PSScriptRoot'; `$env:NEXT_PUBLIC_API_URL='http://localhost:4000/api/v1'; npm run dev:web"
}

Write-Host 'Waiting for API and web app...' -ForegroundColor Cyan
if (-not (Wait-Http 'http://localhost:4000/api/docs')) {
    Write-Host 'API did not become ready. Check the API terminal for errors.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}
if (-not (Wait-Http 'http://localhost:3000')) {
    Write-Host 'Web app did not become ready. Check the web terminal for errors.' -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}
else {
    Write-Host 'Web app already appears to be running.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'ERP app is starting...' -ForegroundColor Green
Write-Host 'Frontend: http://localhost:3000'
Write-Host 'API docs: http://localhost:4000/api/docs'
Write-Host 'Admin login: admin@erp.local / ChangeMeNow!123'
Write-Host ''

try {
    Start-Process 'http://localhost:3000'
    Start-Process 'http://localhost:4000/api/docs'
}
catch {}

Read-Host 'Press Enter to close this launcher'
