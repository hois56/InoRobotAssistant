$ErrorActionPreference = 'Stop'
$target = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $PSScriptRoot 'target' }
$exe = Join-Path $target 'release/InoRobotVirtualControllerBridge.exe'
$archive = Join-Path $target ("bridge-" + [guid]::NewGuid() + ".zip")
Compress-Archive -LiteralPath $exe -DestinationPath $archive
Move-Item -LiteralPath $archive -Destination "$PSScriptRoot/../bridge/InoRobotVirtualControllerBridge.zip" -Force
