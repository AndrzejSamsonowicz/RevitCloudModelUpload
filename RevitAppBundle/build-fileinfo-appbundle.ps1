# Build script for RevitFileInfoExtractor AppBundle
# This creates an AppBundle that detects Revit file version using BasicFileInfo API

Write-Host "Building RevitFileInfoExtractor AppBundle..." -ForegroundColor Green

# Check if MSBuild exists
$msbuildPath = "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe"
if (-not (Test-Path $msbuildPath)) {
    $msbuildPath = "C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe"
}
if (-not (Test-Path $msbuildPath)) {
    Write-Host "ERROR: MSBuild not found. Please install Visual Studio 2019 or 2022." -ForegroundColor Red
    exit 1
}

Write-Host "Using MSBuild at: $msbuildPath" -ForegroundColor Cyan

# Restore NuGet packages
Write-Host "Restoring NuGet packages..." -ForegroundColor Yellow
nuget restore packages.config.fileinfo -PackagesDirectory packages

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: NuGet restore failed!" -ForegroundColor Red
    exit 1
}

# Build the project
Write-Host "Building project..." -ForegroundColor Yellow
& $msbuildPath RevitFileInfoExtractor.csproj /p:Configuration=Release /p:Platform="Any CPU"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed!" -ForegroundColor Red
    exit 1
}

# Check if the AppBundle ZIP was created
if (Test-Path "RevitFileInfoExtractor.zip") {
    Write-Host "`n✓ SUCCESS!" -ForegroundColor Green
    Write-Host "AppBundle created: RevitFileInfoExtractor.zip" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Cyan
    Write-Host "1. Upload this AppBundle to Design Automation" -ForegroundColor White
    Write-Host "2. Create an Activity that uses this AppBundle" -ForegroundColor White
    Write-Host "3. Use it to detect Revit file versions before publishing" -ForegroundColor White
} else {
    Write-Host "ERROR: AppBundle ZIP file not created!" -ForegroundColor Red
    exit 1
}
