param([string]$SourcePath, [string]$OutputPath)
$ErrorActionPreference = 'Stop'
Add-Type -Path $SourcePath -OutputAssembly $OutputPath -OutputType WindowsApplication -ReferencedAssemblies System.Windows.Forms,System.Drawing
