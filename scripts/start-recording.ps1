<#
.SYNOPSIS
    Kashtrix StreamOps - Start Recording Command (PowerShell)
.EXAMPLE
    .\start-recording.ps1 -App live -Stream stream1 -Format mp4
#>
param (
    [Parameter(Mandatory=$true, Position=0)][string]$App,
    [Parameter(Mandatory=$true, Position=1)][string]$Stream,
    [Parameter(Position=2)][string]$Format = "mp4"
)

$targetScript = Join-Path $PSScriptRoot "record-client.cjs"
& node $targetScript start $App $Stream $Format
