# Compiles resources/bin/TabScanner.cs into resources/bin/TabScanner.exe with the
# .NET Framework 4 compiler that ships with Windows (no SDK needed).
$ErrorActionPreference = 'Stop'
$fw  = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$bin = Join-Path $PSScriptRoot '..\resources\bin'
& "$fw\csc.exe" /nologo /optimize+ /target:exe /platform:anycpu `
  /out:"$bin\TabScanner.exe" `
  /reference:"$fw\WPF\UIAutomationClient.dll" `
  /reference:"$fw\WPF\UIAutomationTypes.dll" `
  /reference:"$fw\WPF\WindowsBase.dll" `
  "$bin\TabScanner.cs"
if ($LASTEXITCODE -ne 0) { throw "csc failed with exit code $LASTEXITCODE" }
Write-Host "Built $bin\TabScanner.exe"
