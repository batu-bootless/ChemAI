# Build environment for this project. Dot-source it:  . .\scripts\env.ps1
# Defaults point everything that writes large files at drive D: (C: is full on the build PC).
# Any variable that is already set is left alone.

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$AndroidRoot = Join-Path $ProjectRoot 'android'

function Set-DefaultEnv([string]$Name, [string]$Value) {
    if (-not [Environment]::GetEnvironmentVariable($Name)) {
        [Environment]::SetEnvironmentVariable($Name, $Value, 'Process')
    }
}

Set-DefaultEnv 'ANDROID_HOME' 'D:\android-sdk'
Set-DefaultEnv 'GRADLE_USER_HOME' 'D:\gradle'
Set-DefaultEnv 'CHEMPLUS_TMP' 'D:\targa\tmp\gradle-tmp'
Set-DefaultEnv 'npm_config_cache' 'D:\targa\tmp\npm-cache'
Set-DefaultEnv 'NEXT_TELEMETRY_DISABLED' '1'

# Capacitor 8 compiles with Java 21.
if (-not $env:JAVA_HOME) {
    $jdk = Get-ChildItem 'C:\Program Files\Microsoft' -Directory -Filter 'jdk-2*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}
if (-not $env:JAVA_HOME) { throw 'JAVA_HOME is not set and no JDK 21 was found.' }

New-Item -ItemType Directory -Force -Path $env:CHEMPLUS_TMP | Out-Null
# On Windows the JVM takes java.io.tmpdir from TMP/TEMP.
$env:TEMP = $env:CHEMPLUS_TMP
$env:TMP = $env:CHEMPLUS_TMP

# Gradle reads the SDK location from local.properties (Android Studio writes the same file).
$localProperties = Join-Path $AndroidRoot 'local.properties'
if ((Test-Path $AndroidRoot) -and -not (Test-Path $localProperties)) {
    $sdkDir = $env:ANDROID_HOME -replace '\\', '\\' -replace ':', '\:'
    Set-Content -Path $localProperties -Value "sdk.dir=$sdkDir" -Encoding ascii
}

$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"
