# Revit Cloud Model Publishing — Precise Technical Reference

Extracted from working production code. Covers both **RCM** (Revit Cloud Model, single-user) and **C4R** (Collaborate for Revit, workshared/multiuser).

---

## 1. Model Types

| Property | RCM (Single-User) | C4R (Workshared) |
|---|---|---|
| `doc.IsWorkshared` | `false` | `true` |
| `modelType` field (ACC API) | `"singleuser"` | `"multiuser"` |
| Save method (Design Automation) | `doc.SaveCloudModel()` | `doc.SynchronizeWithCentral()` |
| Publish step needed? | No (save = publish) | Yes — `C4RModelPublish` command |
| Auth needed | 3-legged token | 3-legged token |

---

## 2. URN Types — Critical Distinction

There are **two different URN formats** for the same file. Using the wrong one causes errors.

### Version URN (aka `fileId`, `fs.file`)
Identifies a specific version snapshot. Changes with every new version.
```
urn:adsk.wipprod:fs.file:vf.De1enGF6TbGhYNScCIzShw?version=7
urn:adsk.wipemea:fs.file:vf.XXXXXXXXXXXXXXXXXX?version=21
```

### Item URN / Lineage URN (`dm.lineage`)
Identifies the file item across all versions. **This is required for the publish command.**
```
urn:adsk.wipprod:dm.lineage:XXXXXXXXXXXXXXXXXX
urn:adsk.wipemea:dm.lineage:XXXXXXXXXXXXXXXXXX
```

### How to get the Lineage URN from a Version URN

```javascript
// GET version details, then read the item relationship
const versionResponse = await axios.get(
    `https://developer.api.autodesk.com/data/v1/projects/${projectId}/versions/${encodeURIComponent(versionUrn)}`,
    { headers: { 'Authorization': `Bearer ${userToken}` } }
);
const lineageId = versionResponse.data.data.relationships?.item?.data?.id;
// → "urn:adsk.wipprod:dm.lineage:XXXXXX"
```

### How to get the Lineage URN from file listing

When listing folder contents (`GET /data/v1/projects/{id}/folders/{id}/contents`), each version object has:
```javascript
const lineageId = version.relationships?.item?.data?.id;
```

Store this `lineageId` at file listing time to avoid an extra API call during publish.

### How to construct Lineage URN from GUIDs (Design Automation path)

If you have `projectGuid` and `modelGuid` from the file's ACC URL:
```javascript
const regionPrefix = region === 'EMEA' ? 'wipemea' : 'wipprod';
const lineageId = `urn:adsk.${regionPrefix}:dm.lineage:${modelGuid}`;
```

---

## 3. Authentication

Both APIs require a **3-legged OAuth token** (user-delegated). A 2-legged (app-only) token will be rejected.

Required scopes: `data:read data:write`

The 3-legged token is obtained via the standard APS OAuth Authorization Code flow and must be tied to a user who has permission to edit the project in ACC.

---

## 4. C4R Publish — `C4RModelPublish` Command

### When to use
- C4R (workshared) model needs a new version published to ACC Docs after changes were synchronized.
- Also works for RCM single-user models (optional — `SaveCloudModel()` already saves, but `C4RModelPublish` creates an explicit new viewable version).

### Endpoint
```
POST https://developer.api.autodesk.com/data/v1/projects/{projectId}/commands
```

`projectId` must include the `b.` prefix: `b.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### Headers
```
Authorization: Bearer {3-legged-token}
Content-Type: application/vnd.api+json
```

Note: `application/vnd.api+json` — **not** `application/json`. Wrong Content-Type causes a 415 error.

### Request Body
```json
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
        "data": [
          {
            "type": "items",
            "id": "urn:adsk.wipprod:dm.lineage:XXXXXXXXXXXXXXXXXX"
          }
        ]
      }
    }
  }
}
```

**Critical**: `id` must be the **lineage URN** (`dm.lineage`), not the version URN (`fs.file`).

### Success Response
HTTP 200
```json
{
  "jsonapi": { "version": "1.0" },
  "data": {
    "id": "a5b5ea79-102c-4397-92c9-8de24e7fa393",
    "type": "commands",
    "attributes": {
      "status": "committed",
      "extension": {
        "type": "commands:autodesk.bim360:C4RModelPublish",
        "version": "1.0.0",
        "schema": { "href": "..." }
      }
    }
  }
}
```

`"status": "committed"` means success. The command is fire-and-forget — it returns immediately and the new version appears in ACC Docs within seconds to minutes.

### JavaScript Implementation
```javascript
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

try {
    const response = await axios.post(
        `https://developer.api.autodesk.com/data/v1/projects/${projectId}/commands`,
        payload,
        {
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/vnd.api+json'
            }
        }
    );
    const commandId = response.data.data.id;
    const status = response.data.data.attributes.status; // "committed" = success
} catch (err) {
    // APS returns errors in JSON:API format
    const detail = err.response?.data?.errors?.[0]?.detail
        || err.response?.data?.detail
        || err.message;
    console.error(`Publish failed HTTP ${err.response?.status}: ${detail}`);
}
```

---

## 5. RCM Publish — Design Automation (for making changes + saving)

Use Design Automation when you need to **open the file, modify parameters, then save**.

### Overview
1. Upload an AppBundle (Revit plugin .dll) to APS Design Automation
2. Create an Activity that references the AppBundle
3. Create a WorkItem to run the Activity against a specific cloud model
4. Poll WorkItem status until complete
5. For C4R: call `C4RModelPublish` after WorkItem succeeds

### WorkItem Input Parameters
```json
{
  "Region": "US",
  "ProjectGuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "ModelGuid": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
}
```

- `Region`: `"US"` or `"EMEA"`
- `ProjectGuid`: ACC project ID **without** the `b.` prefix
- `ModelGuid`: The GUID portion from the lineage URN  
  e.g. for `urn:adsk.wipprod:dm.lineage:AbCdEfGh`, the ModelGuid is `AbCdEfGh`

### WorkItem Creation (API)
```
POST https://developer.api.autodesk.com/da/us-east/v3/workitems
Authorization: Bearer {2-legged-token}   ← 2-legged for DA management
Content-Type: application/json
```

```json
{
  "activityId": "{clientId}.{activityName}+{revitVersionAlias}",
  "arguments": {
    "inputJson": {
      "url": "data:application/json,{\"Region\":\"US\",\"ProjectGuid\":\"...\",\"ModelGuid\":\"...\"}"
    },
    "result": {
      "verb": "put",
      "url": "{callback-or-storage-url}"
    },
    "adsk3LeggedToken": {
      "verb": "get",
      "url": "urn:adsk.forge:oauth:token",
      "headers": {
        "Authorization": "Bearer {3-legged-token}"
      }
    }
  }
}
```

**Critical**: The `adsk3LeggedToken` argument passes the user's 3-legged token to the Revit engine so it can open and save cloud models. Without it, cloud model operations fail.

### C# AppBundle — Save Logic

```csharp
// Build cloud model path from GUIDs
string region = inputParams.Region == "EMEA"
    ? ModelPathUtils.CloudRegionEMEA
    : ModelPathUtils.CloudRegionUS;

ModelPath cloudModelPath = ModelPathUtils.ConvertCloudGUIDsToCloudPath(
    region,
    inputParams.ProjectGuid,
    inputParams.ModelGuid);

// Open without prompts
Document doc = rvtApp.OpenDocumentFile(cloudModelPath, new OpenOptions());

// ── Modify parameters here ──

// Save based on model type
if (doc.IsWorkshared)
{
    // C4R — synchronize with central
    SynchronizeWithCentralOptions swc = new SynchronizeWithCentralOptions();
    swc.SetRelinquishOptions(new RelinquishOptions(true));
    swc.Comment = "Automated update via Design Automation";
    doc.SynchronizeWithCentral(new TransactWithCentralOptions(), swc);
}
else
{
    // RCM — save directly to cloud
    doc.SaveCloudModel();
}
```

### WorkItem Status Polling
```
GET https://developer.api.autodesk.com/da/us-east/v3/workitems/{workItemId}
Authorization: Bearer {2-legged-token}
```

Terminal statuses: `success`, `failed`, `cancelled`, `failedInstructions`

---

## 6. Full Workflow by Model Type

### RCM (Single-User) — Modify + Save
```
1. Get file listing → extract version URN and lineage URN
2. Create WorkItem with inputJson (Region, ProjectGuid, ModelGuid) + adsk3LeggedToken
3. Poll WorkItem until status = "success"
4. (Optional) Call C4RModelPublish with lineage URN to create explicit new version
```

### C4R (Workshared) — Modify + Publish
```
1. Get file listing → extract version URN and lineage URN
2. Create WorkItem with inputJson + adsk3LeggedToken
3. WorkItem runs SynchronizeWithCentral() in Revit Engine
4. Poll WorkItem until status = "success"
5. Call C4RModelPublish with lineage URN → status "committed" = done
```

### C4R — Publish Existing Unpublished Changes (No Modifications)
```
Skip Design Automation entirely:
1. Get lineage URN (from file listing or resolve from version URN)
2. Call C4RModelPublish command directly
```
This is the fastest and simplest path when the file already has pending changes.

---

## 7. Common Errors

### `C4RModelPublish` — 403 with code "C4R" — "Failed to publish model"
**Cause 1**: No unpublished changes exist — the model is already at the latest published version.  
**Cause 2**: User does not have "Cloud Models for Revit" service entitlement in their Autodesk account. Go to Autodesk Account Admin → User Management → Products & Services and verify the service is enabled.  
**Cause 3**: User lacks edit permission in the ACC project.

### `C4RModelPublish` — 404 / "Schema not found"
```json
{ "errorDetails": "Schema \"commands:autodesk.bim360:PublishWithoutCommentModel-1.0.0\" was not found." }
```
**Fix**: Use `commands:autodesk.bim360:C4RModelPublish` — `PublishWithoutCommentModel` is deprecated/non-existent.

### Design Automation — WorkItem fails with "AppBundle not found"
The AppBundle has not been uploaded, or the Activity references the wrong qualified name.  
**Fix**: Upload AppBundle first, then create/update the Activity pointing to `{clientId}.{appBundleName}+production`.

### Design Automation — Cloud model fails to open
Cause: `adsk3LeggedToken` argument is missing or the token lacks `data:write` scope.  
The Revit engine cannot authenticate to ACC without a valid 3-legged token.

### Wrong URN type in `C4RModelPublish`
If you pass a version URN (`fs.file`) instead of a lineage URN (`dm.lineage`), the command returns a 4xx error.  
**Fix**: Always resolve to lineage URN before calling the command (see Section 2).

### `Content-Type` error on publish command
**Fix**: Use `application/vnd.api+json`, not `application/json`.

---

## 8. Relevant APS API Endpoints Summary

| Purpose | Method | Endpoint |
|---|---|---|
| List folder items | GET | `/data/v1/projects/{id}/folders/{id}/contents` |
| Get version details (resolve lineage) | GET | `/data/v1/projects/{id}/versions/{encodedVersionUrn}` |
| **Publish model** | POST | `/data/v1/projects/{id}/commands` |
| Get publish job status | POST | `/data/v1/projects/{id}/commands` (GetPublishModelJob) |
| Create WorkItem | POST | `/da/us-east/v3/workitems` |
| Get WorkItem status | GET | `/da/us-east/v3/workitems/{id}` |
| Upload AppBundle | POST | `/da/us-east/v3/appbundles` |
| Create Activity | POST | `/da/us-east/v3/activities` |

Base URL: `https://developer.api.autodesk.com`

---

## 9. Updating Parameters in Revit Cloud Files

When the goal is to **update Revit parameters** (not just publish):

1. **Use Design Automation** — open the cloud model in the Revit engine via WorkItem
2. Inside the C# AppBundle, after opening the document:
   - Use `FilteredElementCollector` to find elements
   - Use `doc.GetElement(id).LookupParameter("ParamName").Set(value)` inside a `Transaction`
   - Commit the transaction
3. **Save** with `SaveCloudModel()` (RCM) or `SynchronizeWithCentral()` (C4R)
4. For C4R: call `C4RModelPublish` afterwards to create a viewable version

The publish step after Design Automation is what makes the updated model visible in ACC Docs viewer. Without it, changes are saved to the central model but no new viewable version is created.
