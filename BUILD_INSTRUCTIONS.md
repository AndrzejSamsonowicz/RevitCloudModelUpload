# Building the Revit AppBundle

## Prerequisites

1. **Visual Studio 2022** or **Build Tools for Visual Studio 2022**
   - Download: https://visualstudio.microsoft.com/downloads/
   - Install with ".NET desktop development" workload

2. **Revit 2025** installed (for Revit API DLLs)
   - The project references DLLs from: `C:\Program Files\Autodesk\Revit 2025\`
   - Required DLLs:
     - RevitAPI.dll
     - RevitAPIUI.dll
     - DesignAutomationBridge.dll

## Build Steps

### Step 1: Verify Revit SDK References

Check that these paths exist:
```
C:\Program Files\Autodesk\Revit 2025\RevitAPI.dll
C:\Program Files\Autodesk\Revit 2025\RevitAPIUI.dll
C:\Program Files\Autodesk\Revit 2025\DesignAutomationBridge.dll
```

If Revit is installed in a different location, update the paths in `RevitCloudPublisher.csproj`.

### Step 2: Build the Project

**Option A: Using Visual Studio**
1. Open `RevitAutomation.sln` in Visual Studio 2022
2. Right-click on the `RevitCloudPublisher` project
3. Select **Build**
4. The compiled DLL will be in: `RevitAppBundle\bin\Release\RevitCloudPublisher.dll`

**Option B: Using MSBuild (Command Line)**
```powershell
# Open Developer Command Prompt for VS 2022, then run:
cd C:\MCPServer\RevitAutomation\RevitAppBundle
msbuild RevitCloudPublisher.csproj /p:Configuration=Release
```

### Step 3: Create the AppBundle ZIP

After building, create a ZIP file with this structure:
```
RevitCloudPublisher.zip
├── PackageContents.xml
└── Contents/
    └── RevitCloudPublisher.dll
```

**PowerShell script to create the bundle:**
```powershell
# Run from RevitAppBundle directory
$bundlePath = ".\bundle"
New-Item -ItemType Directory -Force -Path "$bundlePath\Contents"

# Copy the DLL
Copy-Item ".\bin\Release\RevitCloudPublisher.dll" -Destination "$bundlePath\Contents\"

# Copy PackageContents.xml
Copy-Item ".\PackageContents.xml" -Destination "$bundlePath\"

# Create ZIP
Compress-Archive -Path "$bundlePath\*" -DestinationPath ".\RevitCloudPublisher.zip" -Force

Write-Host "AppBundle created: RevitCloudPublisher.zip"
```

## Upload to Design Automation

Once you have the ZIP file, upload it via the web UI:

1. Go to http://localhost:3000
2. Log in with Autodesk
3. Section 2: Select engine version (2025)
4. Click "Upload AppBundle"
5. Select the `RevitCloudPublisher.zip` file
6. Click "Create Activity"

## Alternative: Skip Building (For Testing Only)

If you just want to test the web application flow without actually processing Revit files, you can create a dummy bundle:

```powershell
cd RevitAppBundle

# Create minimal structure
New-Item -ItemType Directory -Force -Path "bundle\Contents"

# Create a dummy DLL (just for structure - won't work in Revit)
Copy-Item "PackageContents.xml" -Destination "bundle\"
Set-Content -Path "bundle\Contents\RevitCloudPublisher.dll" -Value "DUMMY"

# Create ZIP
Compress-Archive -Path "bundle\*" -DestinationPath "RevitCloudPublisher.zip" -Force
```

**Note:** This dummy bundle will allow you to test the upload workflow, but WorkItems will fail when Design Automation tries to execute them.

## Troubleshooting

### Build Error: "SDK not found"
- Install .NET Framework 4.8 Developer Pack: https://dotnet.microsoft.com/download/dotnet-framework/net48

### Missing Revit DLLs
- Ensure Revit 2025 is installed
- Or copy the required DLLs to a `libs` folder and update the `.csproj` references

### Upload Fails
- Check that the ZIP structure matches the required format
- Ensure `PackageContents.xml` is at the root of the ZIP
- DLL must be in the `Contents` folder

## Next Steps

After successful build and upload:
1. The AppBundle will be available in Design Automation
2. The Activity will be created referencing your AppBundle
3. You can then trigger WorkItems to process Revit Cloud Models
4. Results will be sent to the webhook endpoint
