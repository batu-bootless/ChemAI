# Prints the certificate fingerprints of the upload key (from keystore.properties).
# Google sign-in needs the SHA-1 in an "Android" OAuth client in Google Cloud (see README), together
# with the SHA-1 of the Play App Signing key from Play Console.
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"

$propertiesFile = Join-Path $ProjectRoot 'keystore.properties'
if (-not (Test-Path $propertiesFile)) { throw "Missing $propertiesFile - run scripts\create-upload-keystore.ps1 first." }

$properties = @{}
foreach ($line in Get-Content $propertiesFile) {
    if ($line -match '^\s*([^#=]+?)\s*=\s*(.*)$') { $properties[$matches[1]] = $matches[2] }
}
$keystore = Join-Path $ProjectRoot $properties['storeFile']
if ([IO.Path]::IsPathRooted($properties['storeFile'])) { $keystore = $properties['storeFile'] }

$env:CHEMPLUS_KEYSTORE_PASSWORD = $properties['storePassword']
try {
    $listing = & "$env:JAVA_HOME\bin\keytool.exe" -list -v -keystore $keystore `
        -alias $properties['keyAlias'] -storepass:env CHEMPLUS_KEYSTORE_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw "keytool failed with exit code $LASTEXITCODE" }
} finally {
    Remove-Item Env:\CHEMPLUS_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
}

$sha1 = ($listing | Select-String -Pattern 'SHA1:\s*([0-9A-F:]+)').Matches[0].Groups[1].Value
$sha256 = ($listing | Select-String -Pattern 'SHA256:\s*([0-9A-F:]+)').Matches[0].Groups[1].Value
Write-Host "Upload key SHA-1:   $sha1"
Write-Host "Upload key SHA-256: $sha256"
