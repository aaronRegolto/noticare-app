[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ExpoArgs
)

$jdkCandidates = @(
  $env:JAVA_HOME,
  'C:\Program Files\Java\jdk-21.0.12',
  'C:\Program Files\Java\jdk-21',
  'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.7-hotspot'
) | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin\javac.exe')) }

$noticareJdk = $jdkCandidates | Select-Object -First 1
if (-not $noticareJdk) {
  throw 'A JDK 21 installation is required. Install JDK 21, set JAVA_HOME to its folder, then run npm run android again.'
}

$noticareSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path -LiteralPath (Join-Path $noticareSdk 'platform-tools\adb.exe'))) {
  throw "Android SDK platform-tools were not found at '$noticareSdk'. Install Android SDK Platform 36 and set ANDROID_HOME to the SDK folder."
}

$env:JAVA_HOME = $noticareJdk
$env:ANDROID_HOME = $noticareSdk
$env:Path = "$noticareJdk\bin;$noticareSdk\platform-tools;$env:Path"

# Keep the generated Android project in sync with native Expo modules. Without
# this step an older development build can be missing ExpoSecureStore or
# ExpoClipboard even though the JavaScript packages are installed.
& npx expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& npx expo run:android @ExpoArgs
exit $LASTEXITCODE
