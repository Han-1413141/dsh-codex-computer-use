# This file is ASCII; all localized text arrives as UTF-8 JSON data.
function New-ComputerConsentForm($request) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'DeepSeek Harness - Computer Use'
    $form.ClientSize = New-Object System.Drawing.Size(620, 400)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.AutoScaleMode = 'Dpi'
    $form.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10)
    $form.BackColor = [System.Drawing.Color]::White
    $form.Tag = $false

    $brand = New-Object System.Windows.Forms.Label
    $brand.Text = 'DeepSeek Harness'
    $brand.Location = New-Object System.Drawing.Point(24, 22)
    $brand.Size = New-Object System.Drawing.Size(570, 30)
    $brand.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 14, ([System.Drawing.FontStyle]::Bold))
    $brand.ForeColor = [System.Drawing.Color]::FromArgb(49, 92, 214)

    $heading = New-Object System.Windows.Forms.Label
    $heading.Text = [string]$request.question
    $heading.Location = New-Object System.Drawing.Point(24, 72)
    $heading.Size = New-Object System.Drawing.Size(570, 76)

    $detail = New-Object System.Windows.Forms.TextBox
    $detail.Text = [string]$request.detail
    $detail.Location = New-Object System.Drawing.Point(24, 150)
    $detail.Size = New-Object System.Drawing.Size(570, 164)
    $detail.Multiline = $true
    $detail.ReadOnly = $true
    $detail.ScrollBars = 'Vertical'
    $detail.BorderStyle = 'None'
    $detail.BackColor = [System.Drawing.Color]::White
    $detail.TabStop = $false

    $deny = New-Object System.Windows.Forms.Button
    $deny.Text = [string]$request.deny
    $deny.Location = New-Object System.Drawing.Point(300, 342)
    $deny.Size = New-Object System.Drawing.Size(110, 38)
    $deny.DialogResult = 'Cancel'
    $deny.TabIndex = 0

    $allow = New-Object System.Windows.Forms.Button
    $allow.Text = [string]$request.allow
    $allow.Location = New-Object System.Drawing.Point(428, 342)
    $allow.Size = New-Object System.Drawing.Size(166, 38)
    $allow.DialogResult = 'OK'
    $allow.TabIndex = 1
    $form.CancelButton = $deny
    # Enter does not grant permission merely because the dialog appeared.
    $form.Controls.AddRange(@($brand, $heading, $detail, $deny, $allow))
    $form.ActiveControl = $deny
    return $form
}
