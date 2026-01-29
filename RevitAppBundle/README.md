# Revit AppBundle Build Instructions

This directory contains the Revit AppBundle (C# .NET plugin) that runs in the cloud via Design Automation.

## Prerequisites

- Visual Studio 2019 or later
- .NET Framework 4.8 SDK
- Revit 2024 SDK (or your target version)

## Building the AppBundle

### Option 1: Using Visual Studio

1. Open `RevitCloudPublisher.csproj` in Visual Studio
2. Update the Revit SDK package version in the `.csproj` file if needed
3. Build the project (Release configuration recommended)
4. The packaged `.zip` file will be created in `bin\Release\RevitCloudPublisher.zip`

### Option 2: Using Command Line

```powershell
# From the RevitAppBundle directory
dotnet build -c Release
```

The build process automatically:
1. Compiles the C# code
2. Copies DLLs and PackageContents.xml to `Contents` folder
3. Creates a ZIP archive ready for upload

## Upload to APS

After building, upload the ZIP file via:

1. **Web UI**: Use the "Upload AppBundle" feature in the web app
2. **API**: POST to `/api/design-automation/appbundle/upload`
3. **Manual**: Use Postman or curl to upload directly to Design Automation API

## Customizing the Logic

Edit `RevitCloudPublisherApp.cs` to add your custom automation logic:

- Modify model parameters
- Run validations
- Export data
- Apply rules or standards

The cloud model is automatically opened and synchronized.

## Troubleshooting

- Ensure all references resolve correctly
- Check that DesignAutomationBridge.dll path matches your Revit installation
- Verify PackageContents.xml is included in the output
- Test locally with Revit if possible before uploading

## Required Files in ZIP

```
Contents/
  ├── RevitCloudPublisher.dll
  ├── PackageContents.xml
  └── (any other dependencies)
```
