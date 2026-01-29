# Build Revit AppBundle and create ZIP package
# This script compiles the C# project and packages it for Design Automation

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building Revit AppBundle" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find MSBuild
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$msbuildPath = $null

if (Test-Path $vswhere) {
    $msbuildPath = & $vswhere -latest -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe | Select-Object -First 1
}

# If vswhere didn't find it, search manually
if (-not $msbuildPath) {
    Write-Host "Searching for MSBuild..." -ForegroundColor Yellow
    $msbuildPath = Get-ChildItem "${env:ProgramFiles(x86)}\Microsoft Visual Studio" -Recurse -Filter "MSBuild.exe" -ErrorAction SilentlyContinue | 
        Where-Object { $_.FullName -like "*\Current\Bin\MSBuild.exe" } | 
        Select-Object -First 1 -ExpandProperty FullName
}

if (-not $msbuildPath) {
    Write-Host "[ERROR] Visual Studio Build Tools not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Build Tools first by running:" -ForegroundColor Yellow
    Write-Host "  .\install-build-tools.ps1" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "Found MSBuild: $msbuildPath" -ForegroundColor Gray
Write-Host ""

# Navigate to project directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Clean previous builds
Write-Host "Cleaning previous builds..." -ForegroundColor Cyan
if (Test-Path "bin") { Remove-Item "bin" -Recurse -Force }
if (Test-Path "obj") { Remove-Item "obj" -Recurse -Force }
if (Test-Path "bundle") { Remove-Item "bundle" -Recurse -Force }
if (Test-Path "RevitCloudPublisher.zip") { Remove-Item "RevitCloudPublisher.zip" -Force }

# Build the project
Write-Host "Building project..." -ForegroundColor Cyan
& $msbuildPath "RevitCloudPublisher.csproj" /p:Configuration=Release /p:Platform=AnyCPU /t:Rebuild /v:minimal

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Build successful" -ForegroundColor Green
Write-Host ""

# Check if DLL was created
$dllPath = "bin\Release\RevitCloudPublisher.dll"
if (-not (Test-Path $dllPath)) {
    Write-Host "[ERROR] DLL not found at: $dllPath" -ForegroundColor Red
    exit 1
}

# Create bundle structure with .bundle folder
Write-Host "Creating AppBundle package..." -ForegroundColor Cyan

$bundlePath = "bundle"
$bundleFolderName = "RevitCloudPublisher.bundle"
$bundleFolder = "$bundlePath\$bundleFolderName"
$contentsPath = "$bundleFolder\Contents"

New-Item -ItemType Directory -Force -Path $contentsPath | Out-Null

# Copy DLL
Copy-Item $dllPath -Destination $contentsPath
Write-Host "  [OK] Copied RevitCloudPublisher.dll" -ForegroundColor Gray

# Copy DesignAutomationBridge.dll from NuGet package
$dabDll = Get-ChildItem "$PSScriptRoot\packages" -Recurse -Filter "DesignAutomationBridge.dll" | Select-Object -First 1
if ($dabDll) {
    Copy-Item $dabDll.FullName -Destination $contentsPath -Force
    Write-Host "  [OK] Copied DesignAutomationBridge.dll" -ForegroundColor Gray
} else {
    Write-Host "  [WARN] DesignAutomationBridge.dll not found in packages" -ForegroundColor Yellow
}

# Copy Newtonsoft.Json.dll from NuGet package
$jsonDll = Get-ChildItem "$PSScriptRoot\packages" -Recurse -Filter "Newtonsoft.Json.dll" | Select-Object -First 1
if ($jsonDll) {
    Copy-Item $jsonDll.FullName -Destination $contentsPath -Force
    Write-Host "  [OK] Copied Newtonsoft.Json.dll" -ForegroundColor Gray
} else {
    Write-Host "  [WARN] Newtonsoft.Json.dll not found in packages" -ForegroundColor Yellow
}

# Copy .addin file to Contents folder (per official Autodesk documentation)
$addinPath = "$contentsPath\RevitCloudPublisher.addin"
if (-not (Test-Path $addinPath)) {
    Write-Host "  [INFO] Creating .addin file..." -ForegroundColor Yellow
    @"
<?xml version="1.0" encoding="utf-8"?>
<RevitAddIns>
  <AddIn Type="DBApplication">
    <Name>RevitCloudPublisher</Name>
    <Assembly>.\RevitCloudPublisher.dll</Assembly>
    <AddInId>a1b2c3d4-e5f6-4789-a012-3456789abcde</AddInId>
    <FullClassName>RevitCloudPublisher.RevitCloudPublisherApp</FullClassName>
    <Description>Publishes Revit Cloud Models via Design Automation</Description>
    <VendorId>Autodesk</VendorId>
    <VendorDescription>
    </VendorDescription>
  </AddIn>
</RevitAddIns>
"@ | Out-File -FilePath $addinPath -Encoding UTF8
}
Write-Host "  [OK] Copied RevitCloudPublisher.addin to Contents folder" -ForegroundColor Gray

# Copy PackageContents.xml to bundle folder root
Copy-Item "PackageContents.xml" -Destination $bundleFolder
Write-Host "  [OK] Copied PackageContents.xml" -ForegroundColor Gray

# Create ZIP file from bundle folder (including the .bundle folder)
$zipPath = "RevitCloudPublisher.zip"
Compress-Archive -Path $bundleFolder -DestinationPath $zipPath -Force
Write-Host "  [OK] Created ZIP package" -ForegroundColor Gray

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "[SUCCESS] AppBundle ready!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Package: $zipPath" -ForegroundColor Cyan
Write-Host "Size: $((Get-Item $zipPath).Length / 1KB) KB" -ForegroundColor Gray
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Go to http://localhost:3000" -ForegroundColor White
Write-Host "2. Log in with Autodesk" -ForegroundColor White
Write-Host "3. Upload this ZIP file using the 'Upload AppBundle' button" -ForegroundColor White
Write-Host "4. Create the Activity" -ForegroundColor White
Write-Host "5. Test publishing a Revit Cloud Model" -ForegroundColor White
Write-Host ""

# Show bundle contents
Write-Host "Bundle structure:" -ForegroundColor Gray
Get-ChildItem $bundlePath -Recurse | ForEach-Object {
    $indent = "  " * ($_.FullName.Split('\').Count - $bundlePath.Split('\').Count - 1)
    Write-Host "$indent$($_.Name)" -ForegroundColor DarkGray
}
