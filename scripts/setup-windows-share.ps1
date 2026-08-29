# =========================================================================
# Kashtrix StreamOps - Windows Media Network Share Auto-Configurator (PowerShell)
# =========================================================================

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "Kashtrix StreamOps - Configuring Network Media Share (SMB)" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[WARNING] Script is not running as Administrator. Requesting elevation..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$projectRoot = Resolve-Path "$PSScriptRoot\.."
$mediaPath = "$projectRoot\media"
$recordingsPath = "$projectRoot\media\recordings"

if (-not (Test-Path $mediaPath)) {
    New-Item -ItemType Directory -Force -Path $mediaPath | Out-Null
}
if (-not (Test-Path $recordingsPath)) {
    New-Item -ItemType Directory -Force -Path $recordingsPath | Out-Null
}

Write-Host "[1/3] Creating Windows SMB Share 'media' -> $mediaPath" -ForegroundColor Green
try {
    Remove-SmbShare -Name "media" -Force -ErrorAction SilentlyContinue
    New-SmbShare -Name "media" -Path $mediaPath -FullAccess "Everyone" -ErrorAction Stop | Out-Null
    Write-Host "  -> 'media' share created successfully!" -ForegroundColor Green
} catch {
    cmd.exe /c "net share media=`"$mediaPath`" /grant:Everyone,FULL /unlimited"
}

Write-Host "[2/3] Creating Windows SMB Share 'recordings' -> $recordingsPath" -ForegroundColor Green
try {
    Remove-SmbShare -Name "recordings" -Force -ErrorAction SilentlyContinue
    New-SmbShare -Name "recordings" -Path $recordingsPath -FullAccess "Everyone" -ErrorAction Stop | Out-Null
    Write-Host "  -> 'recordings' share created successfully!" -ForegroundColor Green
} catch {
    cmd.exe /c "net share recordings=`"$recordingsPath`" /grant:Everyone,FULL /unlimited"
}

Write-Host "[3/3] Opening File and Printer Sharing in Windows Firewall..." -ForegroundColor Green
try {
    Enable-NetFirewallRule -DisplayGroup "File and Printer Sharing" -ErrorAction SilentlyContinue
} catch {}

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.IPAddress -notmatch '^127\.|^169\.254\.' } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = $env:COMPUTERNAME }

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Network SMB Share configured!" -ForegroundColor Green
Write-Host "  Windows Explorer / Run:  \\$ip\media" -ForegroundColor Yellow
Write-Host "  Direct Recordings:       \\$ip\recordings" -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host -Prompt "Press Enter to finish..."
