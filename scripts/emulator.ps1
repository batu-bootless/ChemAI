# Opens Chem AI on the test phone (Android emulator) on this PC.
#   .\scripts\emulator.ps1             start the test phone in a window if needed and open Chem AI
#   .\scripts\emulator.ps1 -Headless   the same without a window (automated tests)
#   .\scripts\emulator.ps1 -Stop       shut the test phone down
# The emulator program and system image come from Android Studio's SDK on C:. The test phone's
# own files stay on D: because C: is full.
param(
    [switch]$Headless,
    [switch]$Stop,
    [string]$Avd = 'ChemPlus_Test',
    [string]$AvdHome = 'D:\targa\tmp\avd',
    [string]$EmulatorHome = 'D:\targa\tmp\android-user',
    [string]$EmulatorSdk = (Join-Path $env:LOCALAPPDATA 'Android\Sdk'),
    [int]$BootTimeoutMinutes = 8
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\env.ps1"

$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
$serial = 'emulator-5554'
$package = 'com.chemai.app'

# Under 'Stop', Windows PowerShell turns a native command's stderr into terminating errors, and
# adb reports a missing device on stderr, so adb runs with 'Continue'.
function Invoke-Adb {
    $ErrorActionPreference = 'Continue'
    & $adb -s $serial @args 2>$null
}

function Test-Booted {
    if ((Invoke-Adb get-state) -ne 'device') { return $false }
    return ((Invoke-Adb shell getprop sys.boot_completed) -join '').Trim() -eq '1'
}

if ($Stop) {
    Invoke-Adb emu kill | Out-Null
    Write-Host 'Test phone stopped.'
    return
}

if (-not (Test-Booted)) {
    $emulator = Join-Path $EmulatorSdk 'emulator\emulator.exe'
    if (-not (Test-Path $emulator)) { throw "Android emulator not found: $emulator" }
    if (-not (Test-Path (Join-Path $AvdHome "$Avd.ini"))) { throw "Test phone '$Avd' not found in $AvdHome" }

    # The emulator trusts adb through this PC's public adb key.
    New-Item -ItemType Directory -Force -Path $EmulatorHome | Out-Null
    $publicKey = Join-Path $env:USERPROFILE '.android\adbkey.pub'
    if ((Test-Path $publicKey) -and -not (Test-Path (Join-Path $EmulatorHome 'adbkey.pub'))) {
        Copy-Item $publicKey $EmulatorHome
    }

    $emulatorArgs = @('-avd', $Avd, '-no-snapshot', '-no-boot-anim', '-gpu', 'host', '-memory', '2048',
        '-netdelay', 'none', '-netspeed', 'full')
    if ($Headless) { $emulatorArgs += @('-no-window', '-no-audio') }

    $logDir = Join-Path $env:CHEMPLUS_TMP 'emulator'
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $log = Join-Path $logDir 'emulator.log'

    # The emulator needs the C: SDK; adb in this script keeps using the D: one.
    $sdkBefore = $env:ANDROID_HOME
    $env:ANDROID_SDK_ROOT = $EmulatorSdk
    $env:ANDROID_HOME = $EmulatorSdk
    $env:ANDROID_AVD_HOME = $AvdHome
    $env:ANDROID_EMULATOR_HOME = $EmulatorHome
    $env:ANDROID_USER_HOME = $EmulatorHome
    try {
        # cmd only redirects the log. CreateNoWindow hides its console, not the phone window.
        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $env:ComSpec
        $startInfo.Arguments = '/d /c ""{0}" {1} > "{2}" 2>&1"' -f $emulator, ($emulatorArgs -join ' '), $log
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        [System.Diagnostics.Process]::Start($startInfo) | Out-Null
    } finally {
        $env:ANDROID_HOME = $sdkBefore
        Remove-Item Env:\ANDROID_SDK_ROOT -ErrorAction SilentlyContinue
    }

    Write-Host 'Starting the test phone (this takes a few minutes)...'
    $deadline = (Get-Date).AddMinutes($BootTimeoutMinutes)
    while (-not (Test-Booted)) {
        if ((Get-Date) -gt $deadline) { throw "The test phone did not start within $BootTimeoutMinutes minutes. Log: $log" }
        Start-Sleep -Seconds 5
    }
}

if (-not (Invoke-Adb shell pm list packages $package)) {
    $apk = Get-ChildItem (Join-Path $ProjectRoot 'dist') -Filter '*.apk' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $apk) { throw 'No APK in dist\ - run .\scripts\build.ps1 release first.' }
    Invoke-Adb install -r $apk.FullName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Installing $($apk.Name) failed." }
}

# The activity keeps the Java namespace the sources were copied with (tr.com.chemplus.app).
Invoke-Adb shell am start -n "$package/tr.com.chemplus.app.MainActivity" | Out-Null
Write-Host 'Chem AI is open on the test phone.'
