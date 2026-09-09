Add-Type -AssemblyName System.IO.Compression.FileSystem

$sourceDir = 'E:\SHUTTLE PASS PAYMENTS\2 AUGUST 2026\SHUTTLE PASSES'
$outputDir = 'C:\Users\M.LAPTOP\Desktop\shuttle-pass-system'
$photosDir = Join-Path $outputDir 'photos'
$scriptsDir = Join-Path $outputDir 'scripts'

if (-not (Test-Path $photosDir)) {
    New-Item -ItemType Directory -Path $photosDir | Out-Null
}
if (-not (Test-Path $scriptsDir)) {
    New-Item -ItemType Directory -Path $scriptsDir | Out-Null
}

# Get all docx files in D:\Shuttle Pass (excluding temporary ~$ files)
$docxFiles = Get-ChildItem -Path $sourceDir -Filter "*.docx" | Where-Object { $_.Name -notlike "~$*" }

Write-Host "Found $($docxFiles.Count) docx files in $sourceDir."

$extractedMembers = @()
$photoCounter = 1

foreach ($file in $docxFiles) {
    $filePath = $file.FullName
    $fileName = $file.Name

    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($filePath)
        
        # Extract photos strictly into system photosDir (never touching sourceDir)
        $mediaEntries = $zip.Entries | Where-Object { $_.FullName.StartsWith('word/media/') }
        $assignedPhoto = ''

        foreach ($entry in $mediaEntries) {
            $ext = [System.IO.Path]::GetExtension($entry.FullName)
            if ($ext -match '\.(jpg|jpeg|png|bmp)') {
                $photoFileName = "photo_${photoCounter}${ext}"
                $photoPath = Join-Path $photosDir $photoFileName
                
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $photoPath, $true)
                if (-not $assignedPhoto) {
                    $assignedPhoto = "photos/${photoFileName}"
                }
                $photoCounter++
            }
        }

        # Read document XML
        $docEntry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
        if ($docEntry) {
            $stream = $docEntry.Open()
            $reader = New-Object System.IO.StreamReader($stream)
            $xmlText = $reader.ReadToEnd()
            $reader.Close()
            $stream.Close()

            # Clean text tokens from <w:t>
            $matches = [regex]::Matches($xmlText, '<w:t[^>]*>(.*?)</w:t>')
            $tokens = @()
            foreach ($m in $matches) {
                $clean = [regex]::Replace($m.Groups[1].Value, '<[^>]+>', '').Trim()
                if ($clean -ne '' -and $clean -ne '|') {
                    $tokens += $clean
                }
            }

            # Extract fields
            $cnic = ''
            $name = ''
            $houseNo = ''
            $contact = ''
            $rcn = ''

            # Find CNIC
            $cnicMatch = $tokens | Where-Object { $_ -match '\b\d{5}-\d{7}-\d\b' } | Select-Object -First 1
            if ($cnicMatch) {
                $cnic = [regex]::Match($cnicMatch, '\b\d{5}-\d{7}-\d\b').Value
            }

            # If name is in filename (e.g., "01 SHOAIB ALI CDR TEACHER.docx")
            $fileNameClean = $fileName -replace '^\d+\s*', '' -replace '\.docx$', ''
            if ($fileNameClean -match '^[A-Za-z\s\.\-]+') {
                $name = ($fileNameClean -split 'EMP|EMPLOYEE|CDR|CONT|NEW|PASS')[0].Trim()
            }

            for ($i = 0; $i -lt $tokens.Count; $i++) {
                $tok = $tokens[$i]

                if (-not $cnic -and $tok -match '\b\d{5}-\d{7}-\d\b') {
                    $cnic = [regex]::Match($tok, '\b\d{5}-\d{7}-\d\b').Value
                }

                if (-not $name -and $tok -match '^[A-Z\s]{3,35}$' -and $tok -notin @('RESIDENT CARD', 'SHUTTLE PASS', 'COMMANDER CITY', 'Name:', 'CNIC No:', 'Contact No:', 'Address :', 'Valid Till :', 'Issue Date:')) {
                    if ($tok -ne $cnic) { $name = $tok }
                }

                if ($tok -match 'RCN#?\s*\d+' -or $tok -match 'SP-\d{4}-\d+') {
                    $rcn = $tok
                } elseif (-not $rcn -and $tok -match '^\d{3,5}$') {
                    $rcn = "RCN# $tok"
                }

                if ($tok -match 'BLOCK|LOT|R-|L-|FLAT|HOUSE|APARTMENT|LL-|NN-|KK-|OO-') {
                    $houseNo = $tok
                }

                if ($tok -match '03\d{2}-?\d{7}' -or $tok -match '^\d{2}\s*\|\s*\d{7,8}$') {
                    $contact = $tok
                }
            }

            # Default fallback for serial from filename prefix (e.g. "01", "102")
            if (-not $rcn) {
                $numPrefix = [regex]::Match($fileName, '^\d+').Value
                if ($numPrefix) {
                    $rcn = "SP-$numPrefix"
                } else {
                    $rcn = "SP-001"
                }
            }

            # Only add valid card record
            if ($name -or $cnic) {
                $extractedMembers += [PSCustomObject]@{
                    name = if ($name) { $name } else { $fileNameClean }
                    cnic = if ($cnic) { $cnic } else { "N/A" }
                    houseNo = if ($houseNo) { $houseNo } else { "Commander City" }
                    contact = if ($contact) { $contact } else { "" }
                    rcn = $rcn
                    photo = $assignedPhoto
                    sourceFile = $fileName
                }
            }
        }

        $zip.Dispose()
    }
    catch {
        Write-Host "Error reading ${fileName}: $_"
    }
}

Write-Host "Total Extracted Resident Cards: $($extractedMembers.Count)"

$jsonPath = Join-Path $outputDir 'imported_members.json'
$extractedMembers | ConvertTo-Json -Depth 5 | Set-Content -Path $jsonPath -Encoding UTF8
Write-Host "Saved extracted members dataset to ${jsonPath}"
