# Revit File Version Detection Guide

This guide explains how to set up and use the automatic Revit file version detection system using BasicFileInfo API.

## Overview

The version detection system automatically determines which Revit version (2018-2026) a file was saved in, allowing the application to select the correct Design Automation Activity for publishing.

### How It Works

1. **Two-Step Workflow**:
   - **Step 1**: Submit a WorkItem that runs the `RevitFileInfoExtractor` AppBundle
   - **Step 2**: Use the detected version to select the correct `PublishCloudModelActivity` (2024, 2025, or 2026)

2. **Technology**:
   - Uses Revit's `BasicFileInfo.Extract()` API
   - Reads file metadata WITHOUT fully opening the file
   - Returns version information in seconds (~30 seconds per file)

3. **Official Autodesk Documentation**:
   - Blog Post: https://aps.autodesk.com/blog/check-version-revit-file-using-design-automation-api
   - Sample Code: https://github.com/yiskang/DA4R-RevitBasicFileInfoExtract

## Setup Instructions

### 1. Build the AppBundle

Navigate to the `RevitAppBundle` folder and run the build script:

```powershell
cd RevitAppBundle
.\build-fileinfo-appbundle.ps1
```

This will:
- Restore NuGet packages
- Build the `RevitFileInfoExtractor` project
- Create `RevitFileInfoExtractor.zip` AppBundle

**Requirements**:
- Visual Studio 2019 or 2022 (or MSBuild)
- Revit 2024 installed (for API references)
- NuGet CLI tool

### 2. Upload the AppBundle

Option A: **Via API** (Programmatic)
```bash
POST /api/design-automation/appbundle/upload-fileinfo
Content-Type: multipart/form-data
Authorization: Bearer <session_token>

file: RevitFileInfoExtractor.zip
```

Option B: **Manually** (Using Postman or similar)
```javascript
// Use this Node.js function from designAutomation service
const result = await designAutomation.uploadFileInfoAppBundle(
    'RevitAppBundle/RevitFileInfoExtractor.zip',
    userCredentials
);
```

### 3. Create the Activity

After uploading the AppBundle, create the `DetectRevitVersionActivity`:

```javascript
const result = await designAutomation.createVersionDetectionActivity(userCredentials);
```

This creates:
- **Activity ID**: `<nickname>.DetectRevitVersionActivity+2026`
- **Engine**: Autodesk.Revit+2026 (can read older file versions)
- **Inputs**: `inputFile` (Revit file)
- **Outputs**: `result.json` (version information)

### 4. Verify Setup

Check that both AppBundle and Activity exist:

```bash
GET /api/design-automation/fileinfo/check
Authorization: Bearer <session_token>
```

Expected response:
```json
{
  "appBundle": {
    "exists": true,
    "id": "yourNickname.RevitFileInfoExtractor+production"
  },
  "activity": {
    "exists": true,
    "id": "yourNickname.DetectRevitVersionActivity+2026"
  }
}
```

## Usage

### Detect Single File Version

```javascript
// API Endpoint
POST /api/design-automation/detect-version
{
  "itemId": "urn:adsk.wipprod:dm.lineage:abc123",
  "projectId": "b.project-id",
  "fileName": "Office Building.rvt"
}

// Response
{
  "success": true,
  "data": {
    "workItemId": "abc123xyz",
    "status": "pending",
    "activityId": "yourNickname.DetectRevitVersionActivity+2026",
    "fileName": "Office Building.rvt"
  }
}
```

### Detect Multiple Files (Batch)

```javascript
POST /api/design-automation/detect-versions-batch
{
  "files": [
    {
      "itemId": "urn:adsk.wipprod:dm.lineage:abc123",
      "projectId": "b.project-id",
      "fileName": "Building A.rvt"
    },
    {
      "itemId": "urn:adsk.wipprod:dm.lineage:def456",
      "projectId": "b.project-id",
      "fileName": "Building B.rvt"
    }
  ]
}

// Response
{
  "success": true,
  "results": [
    {
      "itemId": "urn:adsk.wipprod:dm.lineage:abc123",
      "fileName": "Building A.rvt",
      "success": true,
      "workItemId": "workitem-123"
    },
    {
      "itemId": "urn:adsk.wipprod:dm.lineage:def456",
      "fileName": "Building B.rvt",
      "success": true,
      "workItemId": "workitem-456"
    }
  ],
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  }
}
```

### Get Detection Result

After the WorkItem completes (~30 seconds), retrieve the result:

```javascript
GET /api/design-automation/version-result/:workItemId

// Response (Success)
{
  "success": true,
  "data": {
    "status": "success",
    "completed": true,
    "versionInfo": {
      "filename": "Office Building.rvt",
      "format": "2024",              // ← REVIT VERSION
      "isWorkshared": true,
      "centralServerLocation": "...",
      "username": "john.doe@company.com",
      "saveTime": "2024-01-15T10:30:00"
    }
  }
}

// Response (Pending)
{
  "success": true,
  "data": {
    "status": "pending",
    "completed": false
  }
}
```

## Version Information

The `versionInfo.format` field contains the Revit version as a string:

| Revit Version | Format Value |
|---------------|-------------|
| Revit 2018    | `"2018"`    |
| Revit 2019    | `"2019"`    |
| Revit 2020    | `"2020"`    |
| Revit 2021    | `"2021"`    |
| Revit 2022    | `"2022"`    |
| Revit 2023    | `"2023"`    |
| Revit 2024    | `"2024"`    |
| Revit 2025    | `"2025"`    |
| Revit 2026    | `"2026"`    |

### Additional Metadata

The `result.json` also includes:

- **`isWorkshared`**: Whether file uses Worksharing
- **`centralServerLocation`**: Path to central model (if workshared)
- **`username`**: Last user who saved the file
- **`saveTime`**: Last save timestamp
- **`transmittedValue`**: Whether file is detached

## Frontend Integration

### Step 1: Trigger Version Detection

Before publishing, detect versions for selected files:

```javascript
async function detectVersionsBeforePublish(files) {
  const response = await fetch('/api/design-automation/detect-versions-batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionId}`
    },
    body: JSON.stringify({ files })
  });
  
  const data = await response.json();
  return data.results; // Array of { workItemId, fileName, ... }
}
```

### Step 2: Poll for Results

Wait for WorkItems to complete:

```javascript
async function waitForVersionDetection(workItemId) {
  const maxAttempts = 20; // 20 attempts × 3 sec = 60 sec timeout
  
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`/api/design-automation/version-result/${workItemId}`, {
      headers: { 'Authorization': `Bearer ${sessionId}` }
    });
    
    const data = await response.json();
    
    if (data.data.completed) {
      return data.data.versionInfo;
    }
    
    await sleep(3000); // Wait 3 seconds
  }
  
  throw new Error('Version detection timeout');
}
```

### Step 3: Use Detected Version

Select the correct Activity based on detected version:

```javascript
function selectActivity(detectedVersion) {
  const year = parseInt(detectedVersion.format);
  
  // Map Revit version to Activity
  if (year >= 2024 && year <= 2026) {
    return `PublishCloudModelActivity+${year}`;
  } else {
    // Use R2024 for older versions (backward compatible)
    return 'PublishCloudModelActivity+2024';
  }
}
```

### Complete Workflow Example

```javascript
async function publishWithVersionDetection(selectedFiles) {
  try {
    // Step 1: Detect versions
    showProgress('Detecting Revit versions...');
    const detectionResults = await detectVersionsBeforePublish(selectedFiles);
    
    // Step 2: Wait for all detections to complete
    const versions = new Map();
    for (const result of detectionResults) {
      if (result.success) {
        const versionInfo = await waitForVersionDetection(result.workItemId);
        versions.set(result.itemId, versionInfo.format);
        
        // Update UI to show detected version
        updateFileVersionBadge(result.itemId, versionInfo.format);
      }
    }
    
    // Step 3: Group files by version
    const filesByVersion = new Map();
    for (const file of selectedFiles) {
      const version = versions.get(file.itemId) || '2026'; // Default to 2026
      if (!filesByVersion.has(version)) {
        filesByVersion.set(version, []);
      }
      filesByVersion.get(version).push(file);
    }
    
    // Step 4: Publish each group with correct Activity
    for (const [version, files] of filesByVersion) {
      const activityId = selectActivity({ format: version });
      showProgress(`Publishing ${files.length} Revit ${version} files...`);
      await publishFilesWithActivity(files, activityId);
    }
    
    showSuccess('All files published successfully!');
  } catch (error) {
    showError(`Publishing failed: ${error.message}`);
  }
}
```

## Performance Considerations

### Timing

- **Initial detection**: ~30 seconds per file
- **Parallel processing**: Max 10 files at once
- **Example**: 20 files = ~2 minutes for detection

### Caching Strategy

To avoid re-detecting the same file:

```javascript
// Store detected versions in localStorage or database
const cache = new Map(); // itemId → { version, timestamp }

function getCachedVersion(itemId, modifiedDate) {
  const cached = cache.get(itemId);
  
  // Use cache if:
  // 1. Version exists
  // 2. File hasn't been modified since detection
  if (cached && cached.modifiedDate === modifiedDate) {
    return cached.version;
  }
  
  return null; // Need to detect
}

function setCachedVersion(itemId, version, modifiedDate) {
  cache.set(itemId, {
    version,
    modifiedDate,
    timestamp: Date.now()
  });
}
```

### Optimization Tips

1. **Detect on first publish only**: Cache results for subsequent publishes
2. **Show version in UI**: Update "File Version" column after detection
3. **Skip detection for known files**: If user manually specifies version
4. **Batch processing**: Detect all files in parallel (up to 10 concurrent)

## Troubleshooting

### AppBundle Upload Fails

**Error**: `AppBundle not found`

**Solution**: Build the AppBundle first:
```powershell
cd RevitAppBundle
.\build-fileinfo-appbundle.ps1
```

### Activity Creation Fails

**Error**: `AppBundle RevitFileInfoExtractor not found`

**Solution**: Upload the AppBundle before creating the Activity

### WorkItem Fails

**Error**: `Activity not found`

**Solution**: Create the `DetectRevitVersionActivity` first

### No Result JSON

**Error**: `No result URL found in WorkItem`

**Solution**: Check WorkItem report URL for errors:
```javascript
const workItem = await getWorkItemStatus(workItemId);
console.log('Report URL:', workItem.reportUrl);
```

### Version Detection Times Out

**Problem**: WorkItem stuck in "pending" or "inprogress"

**Solution**:
- Check Design Automation quota (max concurrent WorkItems)
- Increase timeout from 60 to 120 seconds
- Check WorkItem report for errors

## Cost Considerations

### Design Automation Credits

- **Version Detection**: 1 WorkItem per file
- **Actual Publishing**: 1 WorkItem per file
- **Total**: 2 WorkItems per publish operation

### Cost Optimization

1. **Cache results**: Detect once, publish many times
2. **Manual override**: Allow users to skip detection if they know the version
3. **Batch detection**: Detect 100+ files once, cache for 30 days

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/design-automation/detect-version` | Detect single file version |
| POST | `/api/design-automation/detect-versions-batch` | Detect multiple files |
| GET | `/api/design-automation/version-result/:workItemId` | Get detection result |
| POST | `/api/design-automation/appbundle/upload-fileinfo` | Upload FileInfo AppBundle |
| POST | `/api/design-automation/activity/create-version-detection` | Create detection Activity |
| GET | `/api/design-automation/fileinfo/check` | Check if AppBundle and Activity exist |

### Data Structures

#### DetectionRequest
```typescript
{
  itemId: string;        // Item URN from Data Management API
  projectId: string;     // Project ID (b.xxx)
  fileName: string;      // File name (for logging)
}
```

#### DetectionResult
```typescript
{
  workItemId: string;    // WorkItem ID for polling
  status: string;        // "pending" | "inprogress" | "success" | "failed"
  activityId: string;    // Activity used for detection
  fileName: string;      // Original file name
}
```

#### VersionInfo
```typescript
{
  filename: string;                // File name
  format: string;                  // Revit version ("2024", "2025", etc.)
  isWorkshared: boolean;           // Worksharing enabled?
  centralServerLocation?: string;  // Central model path
  username: string;                // Last user who saved
  saveTime: string;                // ISO timestamp
  transmittedValue?: boolean;      // Is detached?
}
```

## Next Steps

1. **Build the AppBundle**: Run `build-fileinfo-appbundle.ps1`
2. **Upload to Design Automation**: Use API or manual upload
3. **Create Activity**: Call `createVersionDetectionActivity()`
4. **Update Frontend**: Add version detection before publish
5. **Test**: Try with Revit 2024, 2025, and 2026 files
6. **Deploy**: Push to production VM

## Related Documentation

- [Multi-Version Support Guide](MULTI_VERSION_SUPPORT.md)
- [API Reference](API_REFERENCE_PUBLISHMODEL.md)
- [Testing Guide](TESTING_GUIDE.md)
- [Build Instructions](BUILD_INSTRUCTIONS.md)
