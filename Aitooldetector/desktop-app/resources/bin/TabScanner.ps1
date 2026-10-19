# Fallback when TabScanner.exe cannot run (e.g. blocked by policy): compiles the same
# TabScanner.cs source in-process and runs it with the given arguments.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, WindowsBase
$source = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'TabScanner.cs')
Add-Type -TypeDefinition $source -Language CSharp -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase
exit [TabScanner]::Main([string[]]$args)
