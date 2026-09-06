<#
.SYNOPSIS
    Kashtrix StreamOps - Stop Recording Command (PowerShell)
.EXAMPLE
    .\stop-recording.ps1
    .\stop-recording.ps1 -App live -Stream stream1
#>
param (
    [string]$App,
    [string]$Stream
)

$targetScript = Join-Path $PSScriptRoot "record-client.cjs"
$cliArgs = @("stop")
if ($App) { $cliArgs += $App }
if ($Stream) { $cliArgs += $Stream }

& node $targetScript @cliArgs
