$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (!(Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (!(Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework 4.x compiler is required to build the launcher.' }
$targetExe = Join-Path $projectRoot 'InkrailOpen.exe'
& $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "/win32icon:$(Join-Path $projectRoot 'public\favicon.ico')" "/out:$targetExe" (Join-Path $PSScriptRoot 'InkrailOpenTray.cs') (Join-Path $PSScriptRoot 'SetupWizard.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compilation failed.' }
Write-Output "Built $targetExe"
