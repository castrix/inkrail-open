$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent)
    $nodePath = [IO.File]::ReadAllText((Join-Path (Get-Location) 'data\launcher\node-path.txt')).Trim()
    & $nodePath node_modules/playwright/cli.js install chromium
    if ($LASTEXITCODE -ne 0) { throw 'Browser installation failed. Check the error above and retry.' }
    Write-Host 'Browser support installed.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red }
Read-Host 'Press Enter to close' | Out-Null
