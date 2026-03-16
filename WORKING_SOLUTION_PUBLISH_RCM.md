# ✅ WORKING SOLUTION: Publish Revit Cloud Models to ACC

**Date Confirmed Working**: March 15, 2026  
**Status**: ✅ PRODUCTION READY

## Problem
Single-user Revit Cloud Models (RCM) have auto-save feature that creates "unpublished changes". These changes exist in ACC but don't create new versions until explicitly published.

## ❌ What DOESN'T Work
1. ~~`PublishWithoutCommentModel`~~ - Schema doesn't exist, API returns 404
2. ~~Design Automation WorkItems + Webhooks~~ - Overcomplicated, unnecessary for just publishing existing changes
3. ~~Calling PublishModel before WorkItem completes~~ - Timing issues

## ✅ What WORKS

### Simple Direct API Call
**Just call the Data Management API** with `C4RModelPublish` command:

```javascript
POST https://developer.api.autodesk.com/data/v1/projects/{projectId}/commands

Headers:
  Authorization: Bearer {3-legged-token}
  Content-Type: application/vnd.api+json

Body:
{
  "jsonapi": { "version": "1.0" },
  "data": {
    "type": "commands",
    "attributes": {
      "extension": {
        "type": "commands:autodesk.bim360:C4RModelPublish",
        "version": "1.0.0"
      }
    },
    "relationships": {
      "resources": {
        "data": [{ 
          "type": "items", 
          "id": "{lineage-urn}" 
        }]
      }
    }
  }
}
```

### Critical Details

1. **Command**: `commands:autodesk.bim360:C4RModelPublish`
   - Use for BOTH single-user and workshared models
   - Version: `1.0.0`

2. **Item ID**: Use the **lineage URN**, not the version URN
   - ❌ Wrong: `urn:adsk.wipemea:fs.file:vf.xxx?version=21`
   - ✅ Right: `urn:adsk.wipemea:fs.file:vf.xxx` (without version parameter)

3. **Authentication**: 3-legged OAuth token with `data:write` scope

4. **Response**: 
   - Status: `"committed"` means success
   - Returns `commandId` for tracking

### Code Location
File: `routes/dataManagement.js`  
Endpoint: `POST /api/data-management/publish/:itemId`

```javascript
// Extract lineage ID (remove version parameter)
let lineageId = itemId;
if (itemId.includes('fs.file')) {
    const versionResponse = await axios.get(
        `https://developer.api.autodesk.com/data/v1/projects/${projectId}/versions/${encodeURIComponent(itemId)}`,
        { headers: { 'Authorization': `Bearer ${req.accessToken}` } }
    );
    const itemLink = versionResponse.data.data.relationships?.item?.data?.id;
    if (itemLink) {
        lineageId = itemLink;
    }
}

// Call C4RModelPublish
const payload = {
    jsonapi: { version: '1.0' },
    data: {
        type: 'commands',
        attributes: {
            extension: {
                type: 'commands:autodesk.bim360:C4RModelPublish',
                version: '1.0.0'
            }
        },
        relationships: {
            resources: {
                data: [{ type: 'items', id: lineageId }]
            }
        }
    }
};

const response = await axios.post(
    `https://developer.api.autodesk.com/data/v1/projects/${projectId}/commands`,
    payload,
    {
        headers: {
            'Authorization': `Bearer ${req.accessToken}`,
            'Content-Type': 'application/vnd.api+json'
        }
    }
);
```

## When to Use This

✅ **Use this approach when:**
- Files have unpublished changes from manual edits in Revit
- You want to create a new version from existing changes
- Files are RCM (Revit Cloud Models) - single-user or workshared

❌ **Don't use this approach when:**
- Files have NO unpublished changes (nothing to publish)
- You need to make NEW modifications before publishing (use Design Automation)

## Test Files That Confirmed This Works

1. **architekci czerwoni.rvt**
   - Before: v21
   - After: v22 ✅
   - Command ID: `a5b5ea79-102c-4397-92c9-8de24e7fa393`
   - Status: `committed`

2. **architekci niebiescy.rvt**
   - Before: v14
   - After: v15 ✅
   - Command ID: `fa74e687-ad75-47f1-956e-db2324cc9e93`
   - Status: `committed`

## Troubleshooting

### Error: Schema not found
```json
{
  "errorDetails": "Schema \"commands:autodesk.bim360:PublishWithoutCommentModel-1.0.0\" was not found."
}
```
**Fix**: Use `C4RModelPublish` instead of `PublishWithoutCommentModel`

### Error: 403 Forbidden (Code: C4R) for RCM Files
```json
{
  "status": "403",
  "code": "C4R", 
  "detail": "Failed to publish model"
}
```

**Possible causes**:

1. **No unpublished changes** - The file is already at the latest version with no pending changes to publish.

2. **🔴 CRITICAL: "Cloud Models for Revit" service not enabled** *(Most common)*
   - Users need **"Cloud Models for Revit"** service access in their Autodesk account
   - This is a **separate entitlement** from standard ACC access
   - Without it: Users can view/download RCM but **cannot publish** them
   - C4R files work fine because they don't require this service
   - **Symptom**: C4R publishes successfully, but RCM returns 403
   - **Fix**: Admin must enable "Cloud Models for Revit" service for the user in Autodesk Account Admin

3. **User doesn't have permission to publish in this project** - Check ACC permissions

### How to Check "Cloud Models for Revit" Access

1. Go to Autodesk Account Admin (accounts.autodesk.com)
2. Navigate to User Management
3. Select the user
4. Check "Products & Services" → Look for "Cloud Models for Revit"
5. If missing, enable it (requires admin rights)

## Design Automation (Optional Advanced Use)

If you need to **make modifications** before publishing, use Design Automation WorkItems:

1. Create WorkItem with `adsk3LeggedToken` parameter
2. Plugin opens cloud model, makes changes, saves with `SaveCloudModel()`
3. **Then** call `C4RModelPublish` API to create version

But for just publishing existing changes, **skip Design Automation entirely**.

## Key Learnings

1. **Keep it simple** - Don't overcomplicate with WorkItems if you just need to publish
2. **C4RModelPublish works for all RCM types** - single-user and workshared
3. **PublishWithoutCommentModel doesn't exist** - undocumented/deprecated
4. **Lineage URN vs Version URN** - Always use lineage (item) URN in commands
5. **3-legged auth required** - Data Management API needs user token, not 2-legged

## References

- Official API: https://aps.autodesk.com/en/docs/data/v2/reference/http/projects-project_id-commands-POST/
- Command type: `commands:autodesk.bim360:C4RModelPublish`
- Works for: ACC (Autodesk Construction Cloud) projects
- Region tested: EMEA (wipemea)
