@echo off
:: =========================================================================
:: Kashtrix StreamOps - Windows Media Network Share Auto-Configurator
:: Shares the local "media" folder as \\<COMPUTER_IP>\media and \\<IP>\recordings
:: =========================================================================

echo ====================================================================
echo Kashtrix StreamOps - Configuring Network Media Share (SMB)
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

echo [1/3] Creating Windows SMB Share "media" -> %MEDIA_DIR%
net share media /delete >nul 2>&1
net share media="%MEDIA_DIR%" /grant:Everyone,FULL /unlimited

echo [2/3] Creating Windows SMB Share "recordings" -> %RECORDINGS_DIR%
net share recordings /delete >nul 2>&1
net share recordings="%RECORDINGS_DIR%" /grant:Everyone,FULL /unlimited

echo [3/3] Enabling Network Discovery and SMB file sharing in Windows Firewall...
netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes >nul 2>&1

echo.
echo ====================================================================
echo [SUCCESS] Windows Network Shares have been created successfully!
echo.
echo You can now access your media files from any workstation on the network:
echo   - Windows Run / Explorer:  \\%COMPUTERNAME%\media
echo   - Direct Recordings:       \\%COMPUTERNAME%\recordings
echo ====================================================================
echo.
pause
