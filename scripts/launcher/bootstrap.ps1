$ErrorActionPreference = 'Stop'
try {
    $projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
    $launcher = Join-Path $projectRoot 'InkrailOpen.exe'
    if (!(Test-Path -LiteralPath $launcher)) { & (Join-Path $PSScriptRoot 'build.ps1') }
    # The first-run wizard is an interactive window; normal launches only show the tray.
    Start-Process -FilePath $launcher -WorkingDirectory $projectRoot -WindowStyle Normal
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
