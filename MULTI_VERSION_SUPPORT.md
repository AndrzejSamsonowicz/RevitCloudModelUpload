# Multi-Version Revit Support Strategy

## Overview

Your setup now supports **multiple Revit versions** (2024, 2025, 2026) for processing Cloud Models. Here's how it works:

## Architecture

### 1. One AppBundle, Multiple Activities

```
RevitCloudPublisher.zip (AppBundle)
├── Supports Revit 2024-2026 (SeriesMin/Max in PackageContents.xml)
└── Used by multiple Activities:
    ├── Activity: revitpub2026.PublishCloudModelActivity+2024
    ├── Activity: revitpub2026.PublishCloudModelActivity+2025
    └── Activity: revitpub2026.PublishCloudModelActivity+2026
```

### 2. Version Compatibility Rules

**Critical:** Revit can only open files saved in the **same or earlier** version:

| Model Version | Can Open In Engine |
|---------------|-------------------|
| Revit 2024    | 2024, 2025, 2026 ✅ |
| Revit 2025    | 2025, 2026 ✅ (NOT 2024 ❌) |
| Revit 2026    | 2026 only ✅ (NOT 2024/2025 ❌) |

**Best Practice:** Always use the **same or newer** Revit engine as the model version.

## Setup Steps

### Step 1: Build AppBundle (Once)

```powershell
cd RevitAppBundle
.\build-appbundle.ps1
```

This creates `RevitCloudPublisher.zip` that works across versions 2024-2026.

### Step 2: Upload AppBundle

1. Go to http://localhost:3000
2. Login with Autodesk
3. Upload `RevitCloudPublisher.zip`

### Step 3: Create Activities for Each Version

You need to create **3 separate Activities**, one for each Revit version:

**Option A: Via API (Recommended)**

```powershell
# Create Activity for Revit 2024
Invoke-WebRequest -Uri 'http://localhost:3000/api/design-automation/activity/create' `
    -Method POST `
    -Headers @{'Content-Type'='application/json'} `
    -Body '{"engineVersion":"2024"}'

# Create Activity for Revit 2025
Invoke-WebRequest -Uri 'http://localhost:3000/api/design-automation/activity/create' `
    -Method POST `
    -Headers @{'Content-Type'='application/json'} `
    -Body '{"engineVersion":"2025"}'

# Create Activity for Revit 2026
Invoke-WebRequest -Uri 'http://localhost:3000/api/design-automation/activity/create' `
    -Method POST `
    -Headers @{'Content-Type'='application/json'} `
    -Body '{"engineVersion":"2026"}'
```

**Option B: Via Web UI**

Currently the UI only creates one Activity. You'll need to call the API 3 times with different versions.

### Step 4: Determine Model Version (TODO)

To automatically select the correct Activity, you need to detect the model's Revit version. This requires:

**Method 1: From File Metadata (Recommended)**

Query the Data Management API for the file's properties:

```javascript
// In dataManagement.js - add this endpoint
router.get('/items/:itemId/properties', async (req, res) => {
    const response = await axios.get(
        `https://developer.api.autodesk.com/data/v1/projects/${projectId}/items/${itemId}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    // Check attributes.extension.version or custom properties
    const revitVersion = parseRevitVersion(response.data);
    res.json({ revitVersion });
});
```

**Method 2: Safe Default (Current Implementation)**

Default to **Revit 2026** (newest version) since it can open all earlier files. If the file is too old, it will still work. If it's a 2026 file, only 2026 can open it.

### Step 5: Update Frontend to Select Version

Modify `publishModel()` in `app.js`:

```javascript
async function publishModel() {
    // ... existing code ...
    
    // TODO: Detect model version from file metadata
    const revitVersion = await detectModelVersion(modelGuid);
    
    const response = await fetch('/api/design-automation/workitem/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId,
            region,
            projectGuid,
            modelGuid,
            revitVersion  // Pass detected version
        })
    });
}
```

## Current Behavior (Default)

Right now, the system uses **Revit 2026** as the default engine. This means:

✅ **Works for:** Models saved in Revit 2024, 2025, 2026  
❌ **Fails for:** N/A (2026 is the latest supported)

## Advanced: Version Detection

To implement automatic version detection, you would:

1. **Query item metadata** from ACC/BIM 360
2. **Parse Revit version** from file properties
3. **Select matching Activity** (2024, 2025, or 2026)
4. **Fallback to latest** (2026) if version unknown

Example implementation needed in `routes/dataManagement.js`:

```javascript
router.get('/items/:itemId/version', getAccessToken, async (req, res) => {
    try {
        const { itemId } = req.params;
        const { projectId } = req.query;
        
        const response = await axios.get(
            `https://developer.api.autodesk.com/data/v1/projects/${projectId}/items/${itemId}`,
            { headers: { 'Authorization': `Bearer ${req.accessToken}` } }
        );
        
        // Parse Revit version from metadata
        const versionInfo = response.data.included?.find(i => 
            i.type === 'versions'
        );
        
        const attributes = versionInfo?.attributes;
        const extension = attributes?.extension;
        
        // Revit version might be in extension.version or custom properties
        let revitVersion = '2026'; // Default to latest
        
        if (extension?.version) {
            revitVersion = parseRevitVersionString(extension.version);
        }
        
        res.json({ revitVersion });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

function parseRevitVersionString(versionString) {
    // Parse strings like "2026", "R2026", "Revit 2026", etc.
    const match = versionString.match(/20(24|25|26)/);
    return match ? `20${match[1]}` : '2026';
}
```

## Cost Considerations

Each Activity execution consumes Design Automation credits. Creating multiple Activities doesn't increase costs - you only pay when WorkItems are executed.

## Testing

Test each version:

```bash
# Test 2024 model → 2024 Activity
# Test 2025 model → 2025 Activity  
# Test 2026 model → 2026 Activity

# Also test compatibility:
# Test 2024 model → 2026 Activity (should work ✅)
# Test 2026 model → 2024 Activity (will fail ❌)
```

## Summary

**Current Status:**
- ✅ AppBundle supports 2024-2026
- ✅ Can create version-specific Activities
- ✅ Defaults to Revit 2026 (safest choice)
- ⏳ TODO: Automatic version detection from model metadata

**For Production:**
1. Build AppBundle targeting R2024-R2026
2. Upload once
3. Create 3 Activities (2024, 2025, 2026)
4. Implement version detection (optional but recommended)
5. Always match or exceed the model's Revit version
