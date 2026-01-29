# API Reference - PublishModel Endpoints

## Overview

New endpoints added for Data Management API PublishModel integration.

---

## POST /api/data-management/publish/:itemId

Publishes a workshared cloud model to BIM 360 Docs.

### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `itemId` | string | The Data Management API item ID (e.g., `urn:adsk.wip:dm.lineage:...`) |

### Request Headers

```
Authorization: Bearer <sessionId>
Content-Type: application/json
```

### Request Body

```json
{
  "projectId": "b.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `projectId` | string | Yes | BIM 360 project ID (with "b." prefix) |

### Success Response (200 OK)

```json
{
  "success": true,
  "commandId": "d3bbe753-ae0a-450d-bbe3-cfd4648f0437",
  "status": "committed",
  "message": "Publish command initiated"
}
```

### Error Responses

#### 400 Bad Request - Missing projectId
```json
{
  "error": "projectId is required in request body"
}
```

#### 401 Unauthorized - Invalid session
```json
{
  "error": "Invalid or expired session"
}
```

#### 403 Forbidden - Permission denied
```json
{
  "error": "User does not have edit permission for this project"
}
```

#### 404 Not Found - Invalid item ID
```json
{
  "error": "Item not found or not a valid cloud model"
}
```

#### 500 Internal Server Error - Not a workshared model
```json
{
  "error": "This model is not a workshared (C4R) model"
}
```

### Example Usage

**JavaScript (Frontend)**:
```javascript
const response = await fetch(
  `/api/data-management/publish/${encodeURIComponent(itemId)}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionId}`
    },
    body: JSON.stringify({ 
      projectId: 'b.c2960674-2d1e-4cc8-a5f0-4b9026fd3f5d' 
    })
  }
);

const data = await response.json();
console.log('Command ID:', data.commandId);
```

**cURL**:
```bash
curl -X POST \
  'http://localhost:3000/api/data-management/publish/urn%3Aadsk.wip%3Adm.lineage%3A...' \
  -H 'Authorization: Bearer abc123sessionid' \
  -H 'Content-Type: application/json' \
  -d '{
    "projectId": "b.c2960674-2d1e-4cc8-a5f0-4b9026fd3f5d"
  }'
```

### Notes

- **Asynchronous Operation**: Returns immediately, publish job runs in background
- **Workshared Only**: Only works with C4R (Collaboration for Revit) models
- **Prerequisites**: Model must be synchronized before publishing
- **3D Views Only**: Publishes default 3D views and sheets
- **New Version**: Creates a new version in BIM 360 Docs

---

## POST /api/data-management/publish-status/:itemId

Gets the status of a PublishModel job.

### URL Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `itemId` | string | The Data Management API item ID |

### Request Headers

```
Authorization: Bearer <sessionId>
Content-Type: application/json
```

### Request Body

```json
{
  "projectId": "b.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### Success Response (200 OK)

```json
{
  "data": {
    "type": "commands",
    "id": "d3bbe753-ae0a-450d-bbe3-cfd4648f0437",
    "attributes": {
      "status": "complete",
      "extension": {
        "type": "commands:autodesk.bim360:C4RModelGetPublishJob",
        "version": "1.0.0",
        "data": {
          "isUpToDate": true,
          "hasConflict": false,
          "lastPublishTime": "2026-01-29T12:34:56Z"
        }
      }
    }
  }
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | Publish job queued |
| `inprogress` | Currently publishing |
| `complete` | Successfully published |
| `failed` | Publish job failed |

### Example Usage

**JavaScript**:
```javascript
const response = await fetch(
  `/api/data-management/publish-status/${encodeURIComponent(itemId)}`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionId}`
    },
    body: JSON.stringify({ projectId })
  }
);

const data = await response.json();
console.log('Publish status:', data.data.attributes.status);
console.log('Up to date:', data.data.attributes.extension.data.isUpToDate);
```

### Notes

- Use to check if model needs publishing before triggering
- `isUpToDate: false` means model has unsynchronized changes
- `hasConflict: true` indicates synchronization conflicts

---

## Workflow Integration

### Complete Publishing Workflow

```javascript
// 1. Trigger WorkItem (Design Automation)
const workItemResponse = await fetch('/api/design-automation/workitem/create', {
  method: 'POST',
  headers: { /* ... */ },
  body: JSON.stringify({ projectGuid, modelGuid, revitVersion })
});

// 2. Poll WorkItem status
function pollWorkItem(workItemId) {
  const interval = setInterval(async () => {
    const status = await getWorkItemStatus(workItemId);
    
    if (status === 'success') {
      clearInterval(interval);
      
      // 3. Publish model (automatic in current implementation)
      await publishModelToBim360(itemId, projectId);
    }
  }, 5000);
}

// 4. Optional: Check publish status
async function checkPublishStatus() {
  const response = await fetch(`/api/data-management/publish-status/${itemId}`, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({ projectId })
  });
  
  const data = await response.json();
  return data.data.attributes.extension.data.isUpToDate;
}
```

---

## Error Handling Best Practices

### Graceful Degradation for Non-Workshared Models

```javascript
async function publishModelToBim360(itemId, projectId) {
  try {
    const response = await fetch(`/api/data-management/publish/${itemId}`, {
      method: 'POST',
      headers: { /* ... */ },
      body: JSON.stringify({ projectId })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✓ Publish initiated');
    } else {
      // Check if error is due to non-workshared model
      const errorMsg = data.error?.toString() || '';
      
      if (errorMsg.includes('not a workshared') || 
          errorMsg.includes('C4R')) {
        console.log('ℹ Model is non-workshared - already saved to cloud');
        // This is expected behavior, not an error
      } else {
        console.error('✗ Publish failed:', errorMsg);
      }
    }
  } catch (error) {
    console.warn('⚠ Publish request failed, but model may still be saved');
  }
}
```

---

## Rate Limits

### Data Management API Limits

- **Commands**: 100 requests per minute
- **Projects**: 60 requests per minute

### Recommendations

- Don't poll publish status more than once every 5 seconds
- Use webhooks for production (future enhancement)
- Batch publish operations when possible

---

## Related Endpoints

### Existing Data Management Endpoints

- `GET /api/data-management/hubs` - List hubs
- `GET /api/data-management/hubs/:hubId/projects` - List projects
- `GET /api/data-management/projects/:projectId/topFolders` - List folders
- `GET /api/data-management/projects/:projectId/folders/:folderId/rvtFiles` - Find Revit cloud models

### Design Automation Endpoints

- `POST /api/design-automation/workitem/create` - Create WorkItem
- `GET /api/design-automation/workitem/:workItemId/status` - Get WorkItem status
- `POST /api/design-automation/activity/create` - Create Activity
- `POST /api/design-automation/appbundle/upload` - Upload AppBundle

---

## Security Considerations

### Authentication

- All endpoints require valid 3-legged OAuth token
- Session ID validated against server-side store
- Token automatically refreshed before expiration

### Authorization

- User must have **edit permission** in BIM 360 Docs
- Cannot publish models in projects without access
- Item ID validation prevents unauthorized access

### Data Validation

- Project ID format validated (must start with "b.")
- Item ID validated as Data Management URN
- All user inputs sanitized and encoded

---

## Testing Checklist

- [ ] Test with workshared cloud model
- [ ] Test with non-workshared cloud model  
- [ ] Test with invalid item ID
- [ ] Test with expired session token
- [ ] Test with insufficient permissions
- [ ] Test error handling and logging
- [ ] Verify graceful degradation
- [ ] Check UI feedback messages

---

## Support & Documentation

- **APS Documentation**: https://aps.autodesk.com/en/docs/data/v2/reference/http/PublishModel/
- **Tutorial**: https://aps.autodesk.com/en/docs/data/v2/tutorials/publish-model/
- **Community**: https://adndevblog.typepad.com/
- **GitHub Issues**: [Your repository URL]

---

## Changelog

### v1.0 (2026-01-29)

- ✨ Added `POST /api/data-management/publish/:itemId` endpoint
- ✨ Added `POST /api/data-management/publish-status/:itemId` endpoint
- ✨ Automatic PublishModel trigger after WorkItem success
- ✨ Graceful error handling for non-workshared models
- 📝 Complete workflow documentation
- 🎨 Added info/warning log styling

---

## Quick Reference

| Operation | Endpoint | Method | Auth Required |
|-----------|----------|--------|---------------|
| Publish model | `/api/data-management/publish/:itemId` | POST | Yes (3-legged) |
| Check publish status | `/api/data-management/publish-status/:itemId` | POST | Yes (3-legged) |
| List cloud models | `/api/data-management/projects/:projectId/folders/:folderId/rvtFiles` | GET | Yes (3-legged) |
| Create WorkItem | `/api/design-automation/workitem/create` | POST | Yes (3-legged + 2-legged) |
