# Builds the CleanStream Android APK on this PC (no Expo account or build limit needed).
#
#   npm run build:apk               build only
#   npm run build:apk -- -Install   build, then install on the phone plugged in by USB
#
# Builds the last COMMITTED version of the current branch (uncommitted changes are left out).
# It builds in C:\csb, a short-path copy of the project: Windows can't handle the very long
# file paths some libraries create when the project sits deep in Documents.
#
# Needs (already set up on this PC): the Android SDK, the JDK that ships in the Android Studio
# folder (only the JDK is used, not Android Studio itself), and CMake + Ninja from winget:
#   winget install --id Kitware.CMake -e
#   winget install --id Ninja-build.Ninja -e
param(
  [switch]$Install,
  # arm64-v8a: real phones (2017 onwards). x86_64: the PC emulator. Add armeabi-v7a for old 32-bit phones.
  [string]$Abis = 'arm64-v8a,x86_64'
)
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$build = 'C:\csb'
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Run($exe, [string[]]$argList) {
  & $exe @argList
  if ($LASTEXITCODE -ne 0) { throw "$exe $($argList -join ' ') failed (exit $LASTEXITCODE)" }
}

# ── Tools ────────────────────────────────────────────────────────────────────
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
$jdk = 'C:\Program Files\Android\Android Studio\jbr'
if (-not (Test-Path "$jdk\bin\java.exe")) { throw "JDK not found at $jdk" }
if (-not (Test-Path $sdk)) { throw "Android SDK not found at $sdk" }
$cmake = Get-Command cmake -ErrorAction SilentlyContinue
$ninja = Get-Command ninja -ErrorAction SilentlyContinue
if (-not $cmake -or -not $ninja) { throw 'CMake or Ninja missing. Run: winget install --id Kitware.CMake -e ; winget install --id Ninja-build.Ninja -e' }
$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:NODE_ENV = 'production'
$env:Path = "$(Split-Path $ninja.Source);$(Split-Path $cmake.Source);$env:Path"

# ── Code to build: the last commit of the current branch ─────────────────────
$branch = (git -C $repo rev-parse --abbrev-ref HEAD).Trim()
$commit = (git -C $repo rev-parse --short HEAD).Trim()
# Build number = commits on the branch: each new APK installs over the old one as an update
# (see app.config.js), and matches the number GitHub gives the same commit.
$buildNo = (git -C $repo rev-list --count HEAD).Trim()
$env:CLEANSTREAM_BUILD = $buildNo
$env:CLEANSTREAM_COMMIT = $commit
if (git -C $repo status --porcelain) {
  Write-Host "Note: you have uncommitted changes. They are NOT in this build (commit them first to include them)." -ForegroundColor Yellow
}
Step "Building $branch at $commit (build $buildNo)"

if (-not (Test-Path $build)) {
  Run git @('-C', $repo, 'worktree', 'add', '--detach', $build, $commit)
} else {
  Run git @('-C', $build, 'checkout', '--force', '--detach', $commit)
}

Push-Location $build
try {
  # Reinstall packages only when they changed.
  $lockHash = (Get-FileHash package-lock.json).Hash
  $stamp = Join-Path $build '.lock-hash'
  if (-not (Test-Path node_modules) -or -not (Test-Path $stamp) -or (Get-Content $stamp) -ne $lockHash) {
    Step 'Installing packages (package-lock.json changed)'
    Run npm @('ci', '--no-audit', '--no-fund')
    Set-Content -Path $stamp -Value $lockHash
  }

  Step 'Generating the Android project from app.json'
  Run npx @('expo', 'prebuild', '--platform', 'android', '--no-install')
  # Use the new CMake/Ninja (they handle long paths); prebuild doesn't keep this file.
  $sdkPath = $sdk -replace '\\', '/'
  $cmakeDir = (Split-Path (Split-Path $cmake.Source)) -replace '\\', '/'
  Set-Content -Path android\local.properties -Encoding ascii -Value "sdk.dir=$sdkPath`ncmake.dir=$cmakeDir"

  Step "Compiling the APK for $Abis (about 5-25 minutes)"
  Push-Location android
  try { Run .\gradlew.bat @('assembleRelease', "-PreactNativeArchitectures=$Abis", '--no-daemon') }
  finally { Pop-Location }
} finally {
  Pop-Location
}

# ── Result ───────────────────────────────────────────────────────────────────
$apk = Join-Path $build 'android\app\build\outputs\apk\release\app-release.apk'
$outDir = Join-Path $repo 'builds'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir ("CleanStream-{0}-build{1}-{2}.apk" -f (Get-Date -Format 'yyyy-MM-dd-HHmm'), $buildNo, $commit)
Copy-Item $apk $out
Step "APK ready: $out"

if ($Install) {
  $adb = Join-Path $sdk 'platform-tools\adb.exe'
  $devices = & $adb devices | Select-String "`tdevice$"
  if (-not $devices) { throw 'No phone found. Plug it in by USB with USB debugging on, and tap Allow on the phone.' }
  Step 'Installing on the connected phone'
  Run $adb @('install', '-r', $out)
  Write-Host 'Installed. Open CleanStream on the phone.' -ForegroundColor Green
}
