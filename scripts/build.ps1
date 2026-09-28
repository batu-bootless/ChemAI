# Builds the Chem AI Android app with this machine's build environment (see env.ps1).
#   .\scripts\build.ps1            dashboard build + debug APK
#   .\scripts\build.ps1 release    dashboard build + signed AAB for Google Play + signed APK, copied to dist\
#   .\scripts\build.ps1 install    dashboard build + release APK installed on the connected device/emulator
#   -SkipWeb                       reuse the last dashboard build (out\) instead of rebuilding it
param(
    [ValidateSet('debug', 'release', 'install')]
    [string]$Target = 'debug',
    [switch]$SkipWeb
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"

function Invoke-Gradle([string[]]$Tasks) {
    # Gradle's warnings go to stderr; only its exit code decides.
    $ErrorActionPreference = 'Continue'
    & (Join-Path $AndroidRoot 'gradlew.bat') -p $AndroidRoot @Tasks --console=plain 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }
}

Push-Location $ProjectRoot
# Build tools write warnings to stderr, which Windows PowerShell turns into errors under 'Stop';
# the exit codes below decide instead.
$ErrorActionPreference = 'Continue'
try {
    if ($SkipWeb) {
        # Still copy out\ into the Android project, in case it changed.
        npx cap sync android
    } else {
        # dark theme CSS (scripts\generate-dark-theme.mjs), next build -> out\, route list for the
        # app (scripts\app-routes.mjs), cap sync android
        npm run build:app
    }
    if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
    $ErrorActionPreference = 'Stop'
}

$hasKey = Test-Path (Join-Path $ProjectRoot 'keystore.properties')
if ($Target -ne 'debug' -and -not $hasKey) {
    Write-Warning 'keystore.properties is missing, so release outputs will be unsigned. Run scripts\create-upload-keystore.ps1 first.'
}

$outputs = Join-Path $AndroidRoot 'app\build\outputs'
switch ($Target) {
    'debug' {
        Invoke-Gradle @('assembleDebug')
        Write-Host "APK: $outputs\apk\debug\app-debug.apk"
    }
    'release' {
        Invoke-Gradle @('bundleRelease', 'assembleRelease')
        $version = (Select-String -Path (Join-Path $AndroidRoot 'app\build.gradle') -Pattern 'versionName "(.+)"').Matches[0].Groups[1].Value
        $dist = Join-Path $ProjectRoot 'dist'
        New-Item -ItemType Directory -Force -Path $dist | Out-Null
        Copy-Item "$outputs\bundle\release\app-release.aab" (Join-Path $dist "chemai-$version.aab") -Force
        Copy-Item "$outputs\apk\release\app-release.apk" (Join-Path $dist "chemai-$version.apk") -Force
        Write-Host "Google Play: $dist\chemai-$version.aab"
        Write-Host "Test APK:    $dist\chemai-$version.apk"
    }
    'install' {
        Invoke-Gradle @('assembleRelease')
        & adb install -r "$outputs\apk\release\app-release.apk"
        if ($LASTEXITCODE -ne 0) { throw "adb install failed with exit code $LASTEXITCODE" }
    }
}
