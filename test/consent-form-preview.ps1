param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
. (Join-Path $PSScriptRoot '../src/windows-consent-ui.ps1')
$answers = @()
foreach ($choice in @('Cancel', 'OK')) {
    $form = New-ComputerConsentForm $request
    if ($form.AcceptButton) { throw 'Unexpected default allow button' }
    if ($form.ActiveControl.DialogResult -ne 'Cancel') { throw 'Default focus must deny' }
    $form.add_Shown({
        if ($choice -eq 'Cancel') {
            $bitmap = New-Object System.Drawing.Bitmap($form.Width, $form.Height)
            $form.DrawToBitmap($bitmap, (New-Object System.Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
            $bitmap.Save($OutputPath)
            $bitmap.Dispose()
        }
        # Presentation-only fixture; this is never connected to app permission.
        $button = $form.Controls | Where-Object { $_ -is [System.Windows.Forms.Button] -and $_.DialogResult -eq $choice }
        $button.PerformClick()
    })
    $answers += [string]$form.ShowDialog()
    $form.Dispose()
}
ConvertTo-Json -InputObject @($answers) -Compress
