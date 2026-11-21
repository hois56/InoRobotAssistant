[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateSet('communicationTester','labelGenerator','trace','logAnalyzer','projectCompare','cadLightweight')][string]$Tool,
    [Parameter(Mandatory)][string]$CurrentVersion,
    [Parameter(Mandatory)][string]$Version,
    [Parameter(Mandatory)][string]$Zip,
    [Parameter(Mandatory)][ValidatePattern('^[0-9a-fA-F]{64}$')][string]$Sha256,
    [Parameter(Mandatory)][ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$Date,
    [Parameter(Mandatory)][string]$Note,
    [Parameter(Mandatory)][string]$Out,
    [string]$Tag,
    [string]$PythonPath,
    [string]$Site = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
# Only a named, verified ZIP can enter the release candidate flow; never build or upload here.
$programs = [ordered]@{
    communicationTester = 'InoRobot_Comm_Test'
    labelGenerator = 'InoRobot_Label_Gen'
    trace = 'InoRobotTrace'
    logAnalyzer = 'InoDiagAnalyzer'
    projectCompare = 'InoRobot_Compare_Project'
    cadLightweight = 'CAD_Lightweight'
}
$Tool = @($programs.Keys | Where-Object { $_ -ieq $Tool })[0]
$expectedExe = '{0}_V{1}.exe' -f $programs[$Tool], $Version
$zipItem = Get-Item -LiteralPath $Zip
if ($zipItem.PSIsContainer -or $zipItem.Extension -ine '.zip') { throw 'Expected a verified ZIP file.' }
if ((Get-FileHash -LiteralPath $zipItem.FullName -Algorithm SHA256).Hash -ine $Sha256) {
    throw 'ZIP SHA-256 does not match the verified release record.'
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($zipItem.FullName)
try {
    $executables = @()
    $traceSdk = $false
    foreach ($entry in $archive.Entries) {
        $name = $entry.FullName.TrimEnd('/')
        $parts = $name.Split('/')
        foreach ($part in $parts) {
            if ($part -match '[<>:"\\|?*\x00-\x1f]' -or
                $part -match '^(CON|PRN|AUX|NUL|COM[1-9\u00b9\u00b2\u00b3]|LPT[1-9\u00b9\u00b2\u00b3])(?:\.|$)') {
                throw "Unsafe Windows ZIP member name: $name"
            }
        }
        $base = $parts[-1]
        if ($entry.FullName.EndsWith('/')) { continue }
        if ($base.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) { $executables += $base }
        if ($base -ieq 'IMC100API.dll' -and $entry.Length -gt 0) { $traceSdk = $true }
    }
    if ($executables.Count -ne 1 -or $executables[0] -cne $expectedExe) {
        throw "ZIP must contain exactly one executable named $expectedExe."
    }
    if ($Tool -eq 'trace' -and -not $traceSdk) { throw 'Trace ZIP must include IMC100API.dll.' }
} finally {
    $archive.Dispose()
}

$launcher = @()
if ($PythonPath) {
    $python = (Get-Item -LiteralPath $PythonPath).FullName
} else {
    $py = Get-Command py -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($py) {
        $python = $py.Source
        $launcher += '-3'
    } else {
        $installed = Get-Command python,python3 -CommandType Application -ErrorAction SilentlyContinue |
            Where-Object { $_.Source -notmatch '\\Microsoft\\WindowsApps\\' } | Select-Object -First 1
        if (-not $installed) { throw 'Python 3.10+ was not found. Specify -PythonPath with a real interpreter path.' }
        $python = $installed.Source
    }
}
$helper = Join-Path $PSScriptRoot 'prepare-debug-release.py'
$cliArgs = @(
    '-B', $helper, '--site', $Site, '--tool', $Tool, '--current', $CurrentVersion,
    '--version', $Version, '--zip', $zipItem.FullName, '--sha256', $Sha256,
    '--date', $Date, ('--note=' + $Note), '--out', $Out
)
if ($Tag) { $cliArgs += @('--tag', $Tag) }
& $python @launcher @cliArgs
if ($LASTEXITCODE -ne 0) { throw "Release candidate preparation failed (exit $LASTEXITCODE)." }
