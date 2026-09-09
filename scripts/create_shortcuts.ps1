$targetDir = "e:\SHUTTLE PASS PAYMENTS\shuttle-pass-system"
$batPath = Join-Path $targetDir "START.bat"
$icoPath = Join-Path $targetDir "shuttle.ico"

$wsh = New-Object -ComObject WScript.Shell

# 1. Folder Shortcut 1
$link1 = $wsh.CreateShortcut((Join-Path $targetDir "Start Shuttle Pass System.lnk"))
$link1.TargetPath = $batPath
$link1.WorkingDirectory = $targetDir
if (Test-Path $icoPath) { $link1.IconLocation = $icoPath }
$link1.Save()

# 2. Folder Shortcut 2
$link2 = $wsh.CreateShortcut((Join-Path $targetDir "Shuttle Pass System.lnk"))
$link2.TargetPath = $batPath
$link2.WorkingDirectory = $targetDir
if (Test-Path $icoPath) { $link2.IconLocation = $icoPath }
$link2.Save()

# 3. Desktop Shortcut
$desktopPath = [Environment]::GetFolderPath("Desktop")
if (Test-Path $desktopPath) {
    $desktopLink = $wsh.CreateShortcut((Join-Path $desktopPath "Shuttle Pass System.lnk"))
    $desktopLink.TargetPath = $batPath
    $desktopLink.WorkingDirectory = $targetDir
    if (Test-Path $icoPath) { $desktopLink.IconLocation = $icoPath }
    $desktopLink.Save()
    Write-Host "Desktop shortcut created at: $desktopPath\Shuttle Pass System.lnk"
}

Write-Host "All shortcuts created successfully!"
