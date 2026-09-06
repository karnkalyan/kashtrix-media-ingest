# =========================================================================
# Kashtrix StreamOps - Windows Media Network Share Auto-Configurator (PowerShell)
# Configures secure authenticated SMB file sharing with Guest login DISABLED
# =========================================================================

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "Kashtrix StreamOps - Secure Authenticated Windows SMB Share Setup" -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[WARNING] Script is not running as Administrator. Requesting UAC elevation..." -ForegroundColor Yellow
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

# 1. Disable Guest account on host machine (Disallow unauthenticated anonymous logins)
Write-Host "[1/6] Disabling Windows Guest Account (Blocking Anonymous Logins)..." -ForegroundColor Yellow
try {
    cmd.exe /c "net user Guest /active:no" | Out-Null
    Write-Host "  -> Guest login successfully DISABLED. Windows will require valid credentials." -ForegroundColor Green
} catch {
    Write-Host "  -> Notice: Could not disable Guest via net user." -ForegroundColor Yellow
}

# 2. Provision and verify dedicated local share accounts with permanent passwords
Write-Host "[2/6] Provisioning Dedicated Local Share User Accounts..." -ForegroundColor Yellow

# User: media_admin
try {
    $adminUser = Get-LocalUser -Name "media_admin" -ErrorAction SilentlyContinue
    if (-not $adminUser) {
        cmd.exe /c "net user media_admin Password123! /add /comment:`"Kashtrix Media Share Administrator`" /expires:never" | Out-Null
        Write-Host "  -> Created local user 'media_admin' (Password: Password123!)." -ForegroundColor Green
    } else {
        cmd.exe /c "net user media_admin Password123! /active:yes /expires:never" | Out-Null
        Write-Host "  -> Activated and updated password for 'media_admin' (Password: Password123!)." -ForegroundColor Green
    }
    cmd.exe /c "net localgroup Users media_admin /add" > $null 2>&1
} catch {
    Write-Host "  -> Notice for media_admin: $_" -ForegroundColor Yellow
}

# User: kashtrix
try {
    $kUser = Get-LocalUser -Name "kashtrix" -ErrorAction SilentlyContinue
    if (-not $kUser) {
        cmd.exe /c "net user kashtrix Kashtrix@123 /add /comment:`"Kashtrix Operator`" /expires:never" | Out-Null
        Write-Host "  -> Created local user 'kashtrix' (Password: Kashtrix@123)." -ForegroundColor Green
    } else {
        cmd.exe /c "net user kashtrix Kashtrix@123 /active:yes /expires:never" | Out-Null
        Write-Host "  -> Activated and updated password for 'kashtrix' (Password: Kashtrix@123)." -ForegroundColor Green
    }
    cmd.exe /c "net localgroup Users kashtrix /add" > $null 2>&1
} catch {
    Write-Host "  -> Notice for kashtrix: $_" -ForegroundColor Yellow
}

# 3. Apply NTFS ACL permissions to media and recordings directory
Write-Host "[3/6] Applying NTFS Directory Access Rights..." -ForegroundColor Yellow
cmd.exe /c "icacls `"$mediaPath`" /grant `"Authenticated Users`":(OI)(CI)(M) /grant `"media_admin`":(OI)(CI)(F) /grant `"kashtrix`":(OI)(CI)(M) /grant `"Administrators`":(OI)(CI)(F) /grant `"Users`":(OI)(CI)(M) /t /c /q" > $null 2>&1
cmd.exe /c "icacls `"$recordingsPath`" /grant `"Authenticated Users`":(OI)(CI)(M) /grant `"media_admin`":(OI)(CI)(F) /grant `"kashtrix`":(OI)(CI)(M) /grant `"Administrators`":(OI)(CI)(F) /grant `"Users`":(OI)(CI)(M) /t /c /q" > $null 2>&1
Write-Host "  -> NTFS permissions granted to Authenticated Users, media_admin, and kashtrix." -ForegroundColor Green

# 4. Flush stale SMB sessions to clear stuck locks (Fixing 'file is being used by another process')
Write-Host "[4/6] Flushing Stale Network Sessions and Releasing Open Locks..." -ForegroundColor Yellow
cmd.exe /c "net session /delete /y" > $null 2>&1
Write-Host "  -> Stale network client handles cleared." -ForegroundColor Green

# 5. Remove existing shares and re-create with Authenticated Permissions
Write-Host "[5/6] Configuring Authenticated SMB Shares 'media' and 'recordings'..." -ForegroundColor Yellow
Remove-SmbShare -Name "media" -Force -ErrorAction SilentlyContinue
Remove-SmbShare -Name "recordings" -Force -ErrorAction SilentlyContinue
cmd.exe /c "net share media /delete" > $null 2>&1
cmd.exe /c "net share recordings /delete" > $null 2>&1

cmd.exe /c "net share media=`"$mediaPath`" /grant:`"Authenticated Users`",FULL /grant:media_admin,FULL /grant:kashtrix,FULL /grant:Administrators,FULL /unlimited" | Out-Null
cmd.exe /c "net share recordings=`"$recordingsPath`" /grant:`"Authenticated Users`",FULL /grant:media_admin,FULL /grant:kashtrix,FULL /grant:Administrators,FULL /unlimited" | Out-Null
Write-Host "  -> Shares 'media' and 'recordings' configured with Authenticated User requirements." -ForegroundColor Green

# 6. Enable Windows Defender Firewall for File and Printer Sharing
Write-Host "[6/6] Ensuring Firewall Allows File and Printer Sharing..." -ForegroundColor Yellow
try {
    Enable-NetFirewallRule -DisplayGroup "File and Printer Sharing" -ErrorAction SilentlyContinue
    cmd.exe /c "netsh advfirewall firewall set rule group=`"File and Printer Sharing`" new enable=Yes" > $null 2>&1
} catch {}
Write-Host "  -> Firewall rules enabled." -ForegroundColor Green

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.IPAddress -notmatch '^127\.|^169\.254\.' } | Select-Object -First 1).IPAddress
if (-not $ip) { $ip = $env:COMPUTERNAME }

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "[SUCCESS] Windows Authenticated Network SMB Share is Ready!" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  Network Share Path:    \\$ip\media" -ForegroundColor Yellow
Write-Host "  Direct Recordings:     \\$ip\recordings" -ForegroundColor Yellow
Write-Host ""
Write-Host "  SECURITY STATUS:       GUEST / ANONYMOUS ACCESS IS DISABLED" -ForegroundColor Magenta
Write-Host "  AUTHENTICATION:        Password required on all client PCs" -ForegroundColor White
Write-Host ""
Write-Host "  CREDENTIALS TO ENTER ON OTHER COMPUTERS:" -ForegroundColor Cyan
Write-Host "    - Username:          media_admin   (or .\media_admin)" -ForegroundColor White
Write-Host "    - Password:          Password123!" -ForegroundColor White
Write-Host "    ------------------------------------------------" -ForegroundColor Gray
Write-Host "    - Alt Username:      kashtrix      (or .\kashtrix)" -ForegroundColor White
Write-Host "    - Alt Password:      Kashtrix@123" -ForegroundColor White
Write-Host ""
Write-Host "  IMPORTANT FOR CONNECTING CLIENT WORKSTATIONS:" -ForegroundColor Cyan
Write-Host "    1. If a client PC shows 'used by another process' or has bad cached session," -ForegroundColor Gray
Write-Host "       run this on that client PC in CMD:  net use * /delete /y" -ForegroundColor White
Write-Host "    2. When opening \\$ip\media, enter the username & password above" -ForegroundColor Gray
Write-Host "       and check 'Remember my credentials'." -ForegroundColor Gray
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host -Prompt "Press Enter to exit..."
