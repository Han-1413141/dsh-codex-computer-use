$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    . (Join-Path $PSScriptRoot 'windows-consent-ui.ps1')
    $form = New-ComputerConsentForm $request
    $form.add_Shown({ [Console]::WriteLine('{"type":"ready"}'); $form.Activate() })
    $result = $form.ShowDialog()
    $form.Dispose()
    $accepted = $result -eq [System.Windows.Forms.DialogResult]::OK
    [Console]::WriteLine((@{ type = 'result'; accepted = $accepted } | ConvertTo-Json -Compress))
} catch {
    [Console]::WriteLine((@{ type = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress))
    exit 1
}
