@echo off
REM =======================================================
REM Kashtrix StreamOps - Start Recording CLI Command
REM Usage: start-recording.bat <app> <stream> [format]
REM Example: start-recording.bat live stream1 mp4
REM =======================================================
node "%~dp0record-client.cjs" start %*
