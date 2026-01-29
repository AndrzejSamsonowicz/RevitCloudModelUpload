# Install Build Tools for Visual Studio 2022
# This script downloads and installs the minimum required tools to build the Revit AppBundle

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build Tools Setup for Revit AppBundle" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if already installed
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $msbuildPath = & $vswhere -latest -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe
    if ($msbuildPath) {
        Write-Host "[OK] Build tools already installed!" -ForegroundColor Green
        Write-Host "MSBuild found at: $msbuildPath" -ForegroundColor Gray
        Write-Host ""
        Write-Host "You can now build the project by running:" -ForegroundColor Yellow
        Write-Host "  .\build-appbundle.ps1" -ForegroundColor White
        exit 0
    }
}

Write-Host "Build tools not found. Installing..." -ForegroundColor Yellow
Write-Host ""

# Download installer
$installerUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
$installerPath = "$env:TEMP\vs_BuildTools.exe"

Write-Host "Downloading Build Tools installer..." -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "[OK] Download complete" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Download failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting installation..." -ForegroundColor Cyan
Write-Host "This will install:" -ForegroundColor Gray
Write-Host "  - MSBuild" -ForegroundColor Gray
Write-Host "  - .NET Framework 4.8 SDK" -ForegroundColor Gray
Write-Host "  - C# compiler" -ForegroundColor Gray
Write-Host ""
Write-Host "Please wait, this may take several minutes..." -ForegroundColor Yellow

# Install with required workloads
$arguments = @(
    "--quiet",
    "--wait",
    "--norestart",
    "--nocache",
    "--add", "Microsoft.VisualStudio.Workload.MSBuildTools",
    "--add", "Microsoft.Net.Component.4.8.SDK",
    "--add", "Microsoft.Component.MSBuild"
)

try {
    $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait -PassThru -NoNewWindow
    
    if ($process.ExitCode -eq 0 -or $process.ExitCode -eq 3010) {
        Write-Host ""
        Write-Host "[OK] Installation complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Close and reopen PowerShell (to refresh environment)" -ForegroundColor White
        Write-Host "2. Run: .\build-appbundle.ps1" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "[ERROR] Installation failed with exit code: $($process.ExitCode)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERROR] Installation error: $_" -ForegroundColor Red
    exit 1
} finally {
    # Cleanup
    if (Test-Path $installerPath) {
        Remove-Item $installerPath -Force
    }
}
