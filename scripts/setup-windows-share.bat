@echo off
:: =========================================================================
:: Kashtrix StreamOps - Windows Media Network Share Auto-Configurator (Batch)
:: Configures secure authenticated SMB file sharing with Guest login DISABLED
:: =========================================================================

echo ====================================================================
echo Kashtrix StreamOps - Configuring Authenticated Network Share (SMB)
echo ====================================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Administrator privileges are required to configure Windows Network Shares.
    echo.
    echo Right-click this script and select "Run as administrator" to apply.
    echo.
    pause
    exit /b 1
)

set SCRIPT_DIR=%~dp0..
for %%I in ("%SCRIPT_DIR%\media") do set MEDIA_DIR=%%~fI
for %%I in ("%SCRIPT_DIR%\media\recordings") do set RECORDINGS_DIR=%%~fI

if not exist "%MEDIA_DIR%" (
    echo Creating media directory: %MEDIA_DIR%
    mkdir "%MEDIA_DIR%"
)

if not exist "%RECORDINGS_DIR%" (
    echo Creating recordings directory: %RECORDINGS_DIR%
    mkdir "%RECORDINGS_DIR%"
)

echo [1/6] Disabling Windows Guest Account (Blocking Anonymous Logins)...
net user Guest /active:no >nul 2>&1
echo   - Guest account disabled.

echo [2/6] Provisioning Local Share Users (media_admin & kashtrix)...
net user media_admin Password123! /add /comment:"Kashtrix Media Share Administrator" /expires:never >nul 2>&1
if %errorlevel% neq 0 (
    net user media_admin Password123! /active:yes /expires:never >nul 2>&1
)
net localgroup Users media_admin /add >nul 2>&1

net user kashtrix Kashtrix@123 /add /comment:"Kashtrix Operator" /expires:never >nul 2>&1
if %errorlevel% neq 0 (
    net user kashtrix Kashtrix@123 /active:yes /expires:never >nul 2>&1
)
net localgroup Users kashtrix /add >nul 2>&1

echo [3/6] Setting NTFS Folder Permissions...
icacls "%MEDIA_DIR%" /grant "Authenticated Users":(OI)(CI)(M) /grant "media_admin":(OI)(CI)(F) /grant "kashtrix":(OI)(CI)(M) /grant "Administrators":(OI)(CI)(F) /t /c /q >nul 2>&1
icacls "%RECORDINGS_DIR%" /grant "Authenticated Users":(OI)(CI)(M) /grant "media_admin":(OI)(CI)(F) /grant "kashtrix":(OI)(CI)(M) /grant "Administrators":(OI)(CI)(F) /t /c /q >nul 2>&1

echo [4/6] Flushing Stale Network Sessions and Releasing File Locks...
net session /delete /y >nul 2>&1

echo [5/6] Creating Authenticated Windows SMB Shares (media and recordings)...
net share media /delete >nul 2>&1
net share media="%MEDIA_DIR%" /grant:"Authenticated Users",FULL /grant:media_admin,FULL /grant:kashtrix,FULL /grant:Administrators,FULL /unlimited

net share recordings /delete >nul 2>&1
net share recordings="%RECORDINGS_DIR%" /grant:"Authenticated Users",FULL /grant:media_admin,FULL /grant:kashtrix,FULL /grant:Administrators,FULL /unlimited

echo [6/6] Enabling File and Printer Sharing in Windows Firewall...
netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes >nul 2>&1

echo.
echo ====================================================================
echo [SUCCESS] Authenticated Windows Network Share Created!
echo ====================================================================
echo.
echo Share Path:    \\%COMPUTERNAME%\media
echo Recordings:    \\%COMPUTERNAME%\recordings
echo.
echo SECURITY:      GUEST ACCESS DISABLED (Password required)
echo.
echo CREDENTIALS TO ENTER ON OTHER COMPUTERS:
echo   - Username:   media_admin   (or .\\media_admin)
echo   - Password:   Password123!
echo   -------------------------------------------------
echo   - Alt User:   kashtrix      (or .\\kashtrix)
echo   - Alt Pass:   Kashtrix@123
echo.
echo IF ANOTHER PC SHOWS "used by another process" OR OLD SESSION:
echo   Run on that PC in CMD:   net use * /delete /y
echo ====================================================================
echo.
pause
