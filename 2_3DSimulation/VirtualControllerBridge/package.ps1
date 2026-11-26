param(
    [Parameter(Mandatory)][string]$NodeExe,
    [Parameter(Mandatory)][string]$NodeLicense
)
$ErrorActionPreference = 'Stop'
$platform = & $NodeExe -p "process.platform + '-' + process.arch"
if ($LASTEXITCODE -ne 0 -or $platform -ne 'win32-x64') { throw 'Windows x64 Node.js is required.' }
$target = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $PSScriptRoot 'target' }
$root = (Resolve-Path "$PSScriptRoot/../..").Path
$entries = [ordered]@{
    'InoRobotVirtualControllerBridge.exe' = "$target/release/InoRobotVirtualControllerBridge.exe"
    'vision/node.exe' = $NodeExe
    'vision/LICENSE' = $NodeLicense
    'vision/worker.cjs' = "$PSScriptRoot/src/worker.cjs"
    'vision/virtual-vision-protocols.cjs' = "$root/tools/virtual-vision-protocols.cjs"
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = Join-Path $target ("vision-bridge-" + [guid]::NewGuid() + ".zip")
$zip = [IO.Compression.ZipFile]::Open($archive, 'Create')
try {
    foreach ($entry in $entries.GetEnumerator()) {
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Resolve-Path -LiteralPath $entry.Value).Path, $entry.Key)
    }
} finally { $zip.Dispose() }
Move-Item -LiteralPath $archive -Destination "$PSScriptRoot/../bridge/InoRobotVirtualControllerBridge.zip" -Force
