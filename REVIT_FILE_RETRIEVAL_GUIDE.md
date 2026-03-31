# Revit File Retrieval Guide

## Overview
This document provides a detailed explanation of how the application retrieves Revit Cloud Models from Autodesk Construction Cloud (ACC) after a user selects a project, and all the information that can be fetched about each file.

---

## Workflow: From Project Selection to File Display

### Step 1: User Selects a Project

**Frontend:** `public/app.js` → `selectProject(projectId, projectName)`

When a user clicks on a project:
```javascript
async function selectProject(projectId, projectName) {
    selectedProjectId = projectId;
    selectedProjectName = projectName;
    
    // Show loading modal
    showLoadingModal(`Loading Revit files from ${projectName}...`);
    
    // Fetch top folders
    const topFoldersResponse = await fetch(
        `/api/data-management/projects/${projectId}/topFolders?hubId=${selectedHubId}`,
        { headers: { 'Authorization': `Bearer ${sessionId}` } }
    );
    
    const topFoldersData = await topFoldersResponse.json();
    
    // Load files from all folders
    await loadRevitFilesFromMultipleFolders(projectId, topFoldersData.data);
}
```

---

### Step 2: Fetch Top Folders

**API Call:**
```http
GET /api/data-management/projects/{projectId}/topFolders?hubId={hubId}
Authorization: Bearer {token}
```

**Backend Route:** `routes/dataManagement.js`

**Autodesk API Endpoint:**
```http
GET https://developer.api.autodesk.com/project/v1/hubs/{hubId}/projects/{projectId}/topFolders
```

**Response Structure:**
```json
{
  "data": [
    {
      "type": "folders",
      "id": "urn:adsk.wipprod:fs.folder:co.xxxxxx",
      "attributes": {
        "name": "Project Files",
        "displayName": "Project Files",
        "objectCount": 150,
        "createTime": "2023-01-15T10:30:00.000Z",
        "lastModifiedTime": "2024-03-20T14:45:00.000Z"
      }
    }
  ]
}
```

---

### Step 3: Load Revit Files from All Folders

**Frontend:** `public/app.js` → `loadRevitFilesFromMultipleFolders(projectId, folders, forceRefresh)`

**Caching Mechanism:**
- Files are cached for **5 minutes** per project
- Cache size limited to **10 projects** maximum
- Use `forceRefresh = true` to bypass cache

```javascript
async function loadRevitFilesFromMultipleFolders(projectId, folders, forceRefresh = false) {
    // Check cache first
    if (!forceRefresh) {
        const cachedFiles = getCachedFiles(projectId);
        if (cachedFiles) {
            displayRevitFiles(cachedFiles);
            return;
        }
    }
    
    // Process all folders in parallel
    const folderPromises = folders.map(folder => 
        fetch(`/api/data-management/projects/${projectId}/folders/${folder.id}/rvtFiles`, 
              { headers: { 'Authorization': `Bearer ${sessionId}` } })
    );
    
    const folderResults = await Promise.all(folderPromises);
    const allFiles = folderResults.flat();
    
    // Cache and display
    setCachedFiles(projectId, allFiles);
    displayRevitFiles(allFiles);
}
```

**Key Features:**
- **Parallel Processing:** All folders are queried simultaneously for faster performance
- **Error Handling:** Failed folders don't block others
- **Result Aggregation:** Files from all folders are combined into a single list

---

### Step 4: Backend - Recursive Folder Search for Revit Files

**API Call:**
```http
GET /api/data-management/projects/{projectId}/folders/{folderId}/rvtFiles
Authorization: Bearer {sessionId}
```

**Backend Route:** `routes/dataManagement.js` → `GET /projects/:projectId/folders/:folderId/rvtFiles`

**Process Flow:**

#### 4.1 Recursive Folder Browsing

The backend uses a **recursive tree traversal** to find all Revit files, regardless of folder depth:

```javascript
async function getAllRvtFilesRecursive(currentFolderId, currentPath = '', depth = 0) {
    // Safety limits
    if (depth > 10 || processedFolders.has(currentFolderId)) return;
    
    // Mark folder as processed
    processedFolders.add(currentFolderId);
    
    // Get folder contents with pagination support
    let nextPageUrl = `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${currentFolderId}/contents`;
    
    while (nextPageUrl) {
        const contentsResponse = await axios.get(nextPageUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        // Process items and subfolders...
        
        // Handle pagination
        nextPageUrl = contentsResponse.data.links?.next?.href;
    }
}
```

**Key Features:**
- **Maximum depth:** 10 levels to prevent infinite loops
- **Duplicate prevention:** Tracks processed folders
- **Pagination support:** Handles large folders with multiple pages
- **Parallel subfolder processing:** Processes up to 5 subfolders simultaneously

---

#### 4.2 Autodesk API - Get Folder Contents

**Autodesk API Endpoint:**
```http
GET https://developer.api.autodesk.com/data/v1/projects/{projectId}/folders/{folderId}/contents
Authorization: Bearer {token}
```

**Response Structure:**
```json
{
  "jsonapi": { "version": "1.0" },
  "links": {
    "self": { "href": "..." },
    "next": { "href": "..." }  // Pagination
  },
  "data": [
    {
      "type": "items",
      "id": "urn:adsk.wipprod:dm.lineage:xxxxx",
      "attributes": {
        "displayName": "Architecture.rvt",
        "name": "Architecture.rvt",
        "createTime": "2024-01-10T09:00:00.000Z",
        "lastModifiedTime": "2024-03-30T15:30:00.000Z",
        "extension": {
          "type": "items:autodesk.bim360:C4RModel",
          "version": "1.0",
          "data": {
            "modelType": "singleuser",  // or "multiuser"
            "projectGuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            "modelGuid": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
            "revitVersion": "2024",
            "publishedDate": "2024-03-30T15:30:00.000Z"
          }
        }
      },
      "relationships": {
        "tip": {
          "data": { "type": "versions", "id": "urn:adsk.wipprod:fs.file:vf.xxxxx?version=35" }
        }
      }
    }
  ],
  "included": [
    {
      "type": "versions",
      "id": "urn:adsk.wipprod:fs.file:vf.xxxxx?version=35",
      "attributes": {
        "name": "Architecture.rvt",
        "displayName": "Architecture.rvt",
        "versionNumber": 35,
        "createTime": "2024-03-30T15:30:00.000Z",
        "lastModifiedTime": "2024-03-30T15:30:00.000Z",
        "fileType": "rvt",
        "extension": {
          "type": "versions:autodesk.bim360:C4RModel",
          "data": {
            "modelType": "singleuser",
            "projectGuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            "modelGuid": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
            "revitVersion": "2024",
            "publishedDate": "2024-03-30T15:30:00.000Z"
          }
        }
      },
      "relationships": {
        "lastModifiedUser": {
          "data": { "type": "users", "id": "ABCD1234" }
        },
        "user": {
          "data": { "type": "users", "id": "ABCD1234" }
        }
      }
    },
    {
      "type": "users",
      "id": "ABCD1234",
      "attributes": {
        "name": "John Doe",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@company.com"
      }
    }
  ]
}
```

---

#### 4.3 File Filtering and Version Extraction

The backend filters for Revit files and extracts version information:

```javascript
// Check if item is a Revit file
const isRvtByName = displayName.toLowerCase().endsWith('.rvt');
const isRvtByType = fileType?.toLowerCase().includes('rvt');

if (isRvtByName || isRvtByType) {
    // Get tip version from included array
    const tipVersionId = item.relationships?.tip?.data?.id;
    const tipVersion = tipVersionId ? includedVersions[tipVersionId] : null;
    
    if (tipVersion) {
        // Attach metadata
        tipVersion._itemId = item.id;
        tipVersion._folderPath = currentPath;
        tipVersion._folderId = folderId;
        
        // Attach user information
        const lastModifiedUserId = tipVersion.relationships?.lastModifiedUser?.data?.id;
        if (lastModifiedUserId && includedUsers[lastModifiedUserId]) {
            tipVersion._lastModifiedUser = includedUsers[lastModifiedUserId];
        }
        
        allRevitFiles.push(tipVersion);
    }
}
```

---

### Step 5: Data Extraction and Mapping

**Backend:** All fields extracted from the API response:

```javascript
const rvtFiles = allRevitFiles.map(version => ({
    // Basic identifiers
    id: version.id,                                    // Version URN (e.g., "urn:adsk.wipprod:fs.file:vf.xxxxx?version=35")
    type: version.type,                                // "versions"
    name: version.attributes.displayName,              // File name (e.g., "Architecture.rvt")
    
    // Timestamps
    createTime: version.attributes.createTime,         // ISO 8601 timestamp
    lastModifiedTime: version.attributes.lastModifiedTime,
    publishedDate: version.attributes?.extension?.data?.publishedDate,
    
    // Version information
    versionNumber: version.attributes.versionNumber,   // Integer (e.g., 35)
    fileType: version.attributes.fileType,             // "rvt"
    
    // Cloud Model metadata
    extensionType: version.attributes?.extension?.type, // "versions:autodesk.bim360:C4RModel"
    modelType: version.attributes?.extension?.data?.modelType, // "singleuser" or "multiuser"
    isCloudModel: version.attributes?.extension?.type?.includes('C4RModel'), // Boolean
    projectGuid: version.attributes?.extension?.data?.projectGuid, // GUID for C4RModelPublish
    modelGuid: version.attributes?.extension?.data?.modelGuid,     // GUID for C4RModelPublish
    
    // Revit version detection (tries multiple possible fields)
    revitVersion: version.attributes?.extension?.data?.revitVersion || 
                  version.attributes?.extension?.data?.sourceFileVersion ||
                  version.attributes?.extension?.data?.applicationVersion ||
                  version.attributes?.extension?.data?.formatVersion ||
                  null,
    
    // Location information
    folderPath: folderPath,                            // Full folder path (e.g., "/Project Files/Architectural")
    folderId: version._folderId,                       // Folder URN
    
    // User information (from included users array)
    lastModifiedUser: lastModifiedUserName || lastModifiedUserId,
    publishedBy: lastModifiedUserName || createUserName || lastModifiedUserId
}));
```

---

## Complete List of Available File Information

### Identifiers
| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `id` | String | `urn:adsk.wipprod:fs.file:vf.xxxxx?version=35` | Version URN (unique identifier) |
| `type` | String | `versions` | Resource type |
| `projectGuid` | String (GUID) | `a1b2c3d4-...` | BIM 360 project GUID |
| `modelGuid` | String (GUID) | `e5f6g7h8-...` | Model GUID (unique per file) |
| `folderId` | String | `urn:adsk.wipprod:fs.folder:...` | Parent folder URN |

### File Information
| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `name` | String | `Architecture.rvt` | Display name |
| `fileType` | String | `rvt` | File extension |
| `versionNumber` | Integer | `35` | Current version number |
| `folderPath` | String | `/Project Files/Architectural` | Full folder path |

### Model Type
| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `extensionType` | String | `versions:autodesk.bim360:C4RModel` | Extension type identifier |
| `modelType` | String | `singleuser` or `multiuser` | RCM (single) vs C4R (workshared) |
| `isCloudModel` | Boolean | `true` | Whether it's a Revit Cloud Model |

### Timestamps
| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `createTime` | ISO 8601 | `2024-01-10T09:00:00.000Z` | File creation time |
| `lastModifiedTime` | ISO 8601 | `2024-03-30T15:30:00.000Z` | Last modification time |
| `publishedDate` | ISO 8601 | `2024-03-30T15:30:00.000Z` | Last publish date |

### User Information
| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `lastModifiedUser` | String | `John Doe` or `ABCD1234` | User who last modified |
| `publishedBy` | String | `John Doe` | User who published (fallback to lastModifiedUser) |

### Revit Version
| Field | Type | Example | Description |
|-------|------|---------|-------------|
| `revitVersion` | String | `2024` | Revit version (detected from metadata or filename) |

---

## Frontend Display

### Step 6: Display Files in Table

**Frontend:** `public/app.js` → `displayRevitFiles(files)`

The application displays files in a sortable table with the following columns:

| Column | Sortable | Description |
|--------|----------|-------------|
| ☑️ Checkbox | No | Select files for batch publishing |
| Name | Yes | File name with permission indicator (🔒 if no access) |
| Version | Yes | Version number (e.g., `v35`) |
| File Type | Yes | Badge showing `RCM` (purple) or `C4R` (blue) |
| Folder Path | Yes | Full folder path |
| Publish Date | Yes | Last publish timestamp |
| Time Since Publish | Yes | Human-readable time (e.g., "5 mins", "2 hours", "3 days") |
| Published by | Yes | User name or ID |
| Publishing Time | No | Schedule inputs (hour, minute, weekday checkboxes) + Clear button |

### Special UI Features

**Permission Indicators:**
- Files without edit permissions are greyed out
- Lock icon (🔒) shown next to file name
- Checkbox disabled
- Row has `cursor: not-allowed`

**File Type Badges:**
- **RCM** (purple badge): Single-user Revit Cloud Model (`modelType: "singleuser"`)
- **C4R** (blue badge): Workshared Cloud Model (`modelType: "multiuser"`)

**Auto-updating Time:**
- "Time Since Publish" column updates every minute
- Uses `setInterval` with `updateTimeSinceCells()` function

**Revit Version Detection:**
- Automatically detects from `extension.data.revitVersion` field
- Falls back to filename pattern matching (e.g., "Architecture_2024.rvt" → "2024")
- Defaults to "2026" if not detected
- Stored in `data-revit-version` attribute for Design Automation

---

## Performance Optimizations

### Caching Strategy
```javascript
const fileCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;      // 5 minutes
const MAX_CACHE_SIZE = 10;             // 10 projects max

function setCachedFiles(projectId, files) {
    // Remove oldest entries if cache is full
    if (fileCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = fileCache.keys().next().value;
        fileCache.delete(oldestKey);
    }
    
    fileCache.set(projectId, {
        files: files,
        timestamp: Date.now()
    });
}
```

### Parallel Processing
- **Folders:** All top folders queried in parallel
- **Subfolders:** Up to 5 subfolders processed simultaneously (rate limit protection)
- **Result aggregation:** Files from all folders combined after all requests complete

### Pagination Handling
```javascript
while (nextPageUrl) {
    const contentsResponse = await axios.get(nextPageUrl);
    
    // Process items...
    
    // Get next page
    nextPageUrl = contentsResponse.data.links?.next?.href;
}
```

---

## Error Handling

### Backend
- **Folder access errors:** Logged but don't stop recursive search
- **API errors:** Return appropriate status codes (403, 404, 500)
- **Depth limit:** Maximum 10 levels to prevent infinite loops
- **Duplicate folders:** Tracked in `processedFolders` Set

### Frontend
- **Failed folder requests:** Other folders continue loading
- **Cache miss:** Automatically fetches fresh data
- **Empty results:** Shows "No Revit cloud models found" message
- **Loading states:** Modal with loading message and error display

---

## Usage Examples

### Refresh Files (Bypass Cache)
```javascript
async function refreshProjectFiles() {
    clearFileCache(selectedProjectId);
    
    const topFoldersResponse = await fetch(
        `/api/data-management/projects/${selectedProjectId}/topFolders?hubId=${selectedHubId}`,
        { headers: { 'Authorization': `Bearer ${sessionId}` } }
    );
    
    const topFoldersData = await topFoldersResponse.json();
    await loadRevitFilesFromMultipleFolders(selectedProjectId, topFoldersData.data, true);
}
```

### Get Selected Files
```javascript
const selectedFiles = allRevitFiles.filter((file, index) => {
    const checkbox = document.getElementById(`file-checkbox-${index}`);
    return checkbox && checkbox.checked;
});
```

---

## API Reference Summary

| Step | Endpoint | Method | Purpose |
|------|----------|--------|---------|
| 1 | `/api/data-management/projects/{projectId}/topFolders` | GET | Get top-level folders |
| 2 | `/api/data-management/projects/{projectId}/folders/{folderId}/rvtFiles` | GET | Get Revit files recursively |
| - | `https://developer.api.autodesk.com/data/v1/projects/{projectId}/folders/{folderId}/contents` | GET | Autodesk API - folder contents |
| - | `https://developer.api.autodesk.com/data/v1/projects/{projectId}/folders/{folderId}` | GET | Autodesk API - folder metadata |

---

## Related Documentation

- [API_REFERENCE_PUBLISHMODEL.md](API_REFERENCE_PUBLISHMODEL.md) - Publishing API documentation
- [WORKING_SOLUTION_PUBLISH_RCM.md](WORKING_SOLUTION_PUBLISH_RCM.md) - PublishModel workflow
- [MULTI_VERSION_SUPPORT.md](MULTI_VERSION_SUPPORT.md) - Revit version detection
- [BUILD_INSTRUCTIONS.md](BUILD_INSTRUCTIONS.md) - Setup and deployment

---

**Last Updated:** March 31, 2026
