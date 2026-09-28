# Creates Chem AI's Play Store upload key (keystore/chemai-upload.jks) and keystore.properties with a
# random password, then prints the certificate fingerprint for assetlinks.json.
# Refuses to overwrite an existing key: losing or replacing it means asking Google for a reset.
param(
    [string]$Alias = 'chemai-upload',
    [string]$DName = 'CN=Chem AI Upload Key, O=ChemPlus, C=TR'
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"

$keystoreDir = Join-Path $ProjectRoot 'keystore'
$keystore = Join-Path $keystoreDir 'chemai-upload.jks'
$propertiesFile = Join-Path $ProjectRoot 'keystore.properties'
if (Test-Path $keystore) { throw "Upload key already exists: $keystore" }
if (Test-Path $propertiesFile) { throw "keystore.properties already exists: $propertiesFile" }

# 32 characters from an unambiguous alphabet, without modulo bias.
$alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$buffer = New-Object byte[] 1
$password = ''
while ($password.Length -lt 32) {
    $rng.GetBytes($buffer)
    if ($buffer[0] -lt (256 - (256 % $alphabet.Length))) {
        $password += $alphabet[$buffer[0] % $alphabet.Length]
    }
}

New-Item -ItemType Directory -Force -Path $keystoreDir | Out-Null
$env:CHEMPLUS_KEYSTORE_PASSWORD = $password
try {
    # PKCS12 uses one password for the store and the key. 10000 days covers Play's 2033 minimum.
    # keytool reports progress on stderr, which Windows PowerShell turns into an error under 'Stop'.
    $ErrorActionPreference = 'Continue'
    & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -keystore $keystore -storetype PKCS12 `
        -alias $Alias -keyalg RSA -keysize 4096 -validity 10000 -dname $DName `
        -storepass:env CHEMPLUS_KEYSTORE_PASSWORD -keypass:env CHEMPLUS_KEYSTORE_PASSWORD 2>&1 | ForEach-Object { "$_" }
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $keystore)) { throw "keytool failed with exit code $LASTEXITCODE" }
} finally {
    Remove-Item Env:\CHEMPLUS_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
}

@"
# Upload key for Google Play. Keep this file and keystore/ out of git and back both up.
storeFile=keystore/chemai-upload.jks
storePassword=$password
keyAlias=$Alias
keyPassword=$password
"@ | Set-Content -Path $propertiesFile -Encoding ascii

Write-Host "Created $keystore"
Write-Host "Created $propertiesFile"
& "$PSScriptRoot\print-fingerprints.ps1"
