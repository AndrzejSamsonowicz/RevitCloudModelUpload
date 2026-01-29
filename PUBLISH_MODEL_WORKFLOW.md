# PublishModel Workflow Documentation

## Overview

Complete two-step workflow for publishing Revit Cloud Models to BIM 360 Docs using APS Design Automation and Data Management APIs.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPLETE WORKFLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: DESIGN AUTOMATION API                              │
│  ┌────────────────────────────────────────┐                 │
│  │ 1. Open cloud model in Revit Engine    │                 │
│  │ 2. Make changes (or validate)          │                 │
│  │ 3. Save using appropriate method:      │                 │
│  │    - Workshared: SynchronizeWithCentral│                 │
│  │    - Non-workshared: SaveCloudModel    │                 │
│  └────────────────────────────────────────┘                 │
│                        ↓                                     │
│  Step 2: DATA MANAGEMENT API (Workshared Only)              │
│  ┌────────────────────────────────────────┐                 │
│  │ 1. Call PublishModel command           │                 │
│  │ 2. Creates viewable version in BIM 360 │                 │
│  │ 3. Publishes 3D views and sheets       │                 │
│  └────────────────────────────────────────┘                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Design Automation (AppBundle v28)

**File**: `RevitAppBundle/RevitCloudPublisherApp.cs`

```csharp
// Save logic based on model type
if (doc.IsWorkshared)
{
    // Workshared/C4R model - synchronize with central
    SynchronizeWithCentralOptions swc = new SynchronizeWithCentralOptions();
    swc.SetRelinquishOptions(new RelinquishOptions(true));
    swc.Comment = "Automated publish via Design Automation";
    
    TransactWithCentralOptions twc = new TransactWithCentralOptions();
    doc.SynchronizeWithCentral(twc, swc);
}
else
{
    // Single user cloud model - saves directly to cloud
    doc.SaveCloudModel();
}
```

**Key Points**:
- Opens cloud models without download
- Uses 3-legged token for authentication (required)
- Synchronizes workshared models with central
- Saves non-workshared models directly to cloud

### 2. Data Management API (PublishModel)

**File**: `routes/dataManagement.js`

#### Endpoint: `POST /api/data-management/publish/:itemId`

Publishes a workshared cloud model to BIM 360 Docs, making it viewable and searchable.

**Request**:
```json
{
  "projectId": "b.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

**Command Payload**:
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
        "data": [{ 
          "type": "items", 
          "id": "urn:adsk.wip:dm.lineage:..." 
        }]
      }
    }
  }
}
```

**Response**:
```json
{
  "success": true,
  "commandId": "d3bbe753-ae0a-450d-bbe3-cfd4648f0437",
  "status": "committed",
  "message": "Publish command initiated"
}
```

### 3. Frontend Integration

**File**: `public/app.js`

#### Automatic Publishing After WorkItem Success

```javascript
async function pollWorkItemStatus(workItemId, attempts = 0) {
    // ... polling logic ...
    
    if (status === 'success') {
        // Automatically initiate PublishModel for all models
        const selectedModel = document.getElementById('rvtFileSelect').selectedOptions[0];
        if (selectedModel) {
            const itemId = selectedModel.dataset.itemId;
            const projectId = document.getElementById('projectSelect').value;
            
            if (itemId && projectId) {
                addLog('Initiating model publish to BIM 360 Docs...');
                publishModelToBim360(itemId, projectId);
            }
        }
    }
}
```

#### PublishModel Function

```javascript
async function publishModelToBim360(itemId, projectId) {
    try {
        addLog(`Publishing model (itemId: ${itemId})...`);
        
        const response = await fetch(
            `/api/data-management/publish/${encodeURIComponent(itemId)}`, 
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionStorage.getItem('sessionId')}`
                },
                body: JSON.stringify({ projectId })
            }
        );

        const data = await response.json();

        if (response.ok) {
            addLog(`Publish command initiated (ID: ${data.commandId})`, 'success');
            addLog(`Initial status: ${data.status}`);
            addLog('Model will be available in BIM 360 Docs shortly');
        } else {
            // Handle non-workshared models gracefully
            const errorMsg = data.error?.toString() || 'Unknown error';
            if (errorMsg.includes('not a workshared') || errorMsg.includes('C4R')) {
                addLog('Note: PublishModel only applies to workshared cloud models', 'info');
                addLog('Non-workshared models are already saved to cloud', 'info');
            } else {
                addLog(`Publish warning: ${errorMsg}`, 'warning');
            }
        }
    } catch (error) {
        addLog(`Publish request failed: ${error.message}`, 'warning');
        addLog('Model changes may still be saved to cloud', 'info');
    }
}
```

## Model Type Behavior

### Workshared (C4R) Models

**Design Automation**:
- Opens model via cloud path
- Calls `SynchronizeWithCentral()`
- Changes synchronized to central model

**Data Management**:
- `PublishModel` command creates viewable version
- Publishes 3D default views and sheets
- Creates new version in BIM 360 Docs
- Makes model searchable and viewable

**Result**: Model is synchronized AND published for viewing

### Non-Workshared (Single User) Models

**Design Automation**:
- Opens model via cloud path
- Calls `SaveCloudModel()`
- Saves directly to cloud storage

**Data Management**:
- `PublishModel` not applicable (will return error)
- Model already saved and accessible

**Result**: Model is saved to cloud, immediately available

## Error Handling

### Graceful Degradation

The implementation handles both model types gracefully:

1. **Workshared Models**: Full workflow executes
2. **Non-Workshared Models**: PublishModel fails gracefully with informative message
3. **Network Issues**: Logged as warnings, not errors

### Example Log Output

**Workshared Model (Success)**:
```
[14:23:15] WorkItem completed with status: success
[14:23:15] Initiating model publish to BIM 360 Docs...
[14:23:15] Publishing model (itemId: urn:adsk.wip:dm.lineage:...)...
[14:23:16] ✓ Publish command initiated (ID: d3bbe753...)
[14:23:16] Initial status: committed
[14:23:16] Model will be available in BIM 360 Docs shortly
```

**Non-Workshared Model (Graceful)**:
```
[14:23:15] WorkItem completed with status: success
[14:23:15] Initiating model publish to BIM 360 Docs...
[14:23:15] Publishing model (itemId: urn:adsk.wip:dm.lineage:...)...
[14:23:16] Note: PublishModel only applies to workshared cloud models
[14:23:16] Non-workshared models are already saved to cloud
```

## API Documentation References

### Data Management API

- **PublishModel**: https://aps.autodesk.com/en/docs/data/v2/reference/http/PublishModel/
- **GetPublishModelJob**: https://aps.autodesk.com/en/docs/data/v2/reference/http/GetPublishModelJob/
- **Tutorial**: https://aps.autodesk.com/en/docs/data/v2/tutorials/publish-model/

### Design Automation API

- **Revit Cloud Models**: https://aps.autodesk.com/blog/design-automation-api-supports-revit-cloud-model
- **Official Sample**: https://github.com/Autodesk-Forge/design.automation-nodejs-revit.rcw.parameters.excel

## Requirements

### Authentication

- **3-Legged OAuth**: Required for cloud model access
- **Scope**: `code:all data:write data:create`
- **User Permission**: Edit access to BIM 360 Docs folder

### Revit Versions

- **Minimum**: Revit 2022
- **Supported**: Revit 2024, 2025, 2026
- **Current AppBundle**: Targets Revit 2026

## Testing Workflow

1. **Login** via 3-legged OAuth
2. **Select Hub** (BIM 360 or ACC account)
3. **Select Project**
4. **Browse Folder** containing Revit cloud models
5. **Select Cloud Model** (.rvt file)
6. **Trigger Publish**:
   - WorkItem executes in Design Automation
   - Model opens and saves/synchronizes
   - PublishModel command initiated (if workshared)
7. **Monitor Logs**:
   - WorkItem status updates
   - PublishModel status
   - Completion confirmation

## Troubleshooting

### "PublishModel not applicable" Message

**Cause**: Model is non-workshared (single user)
**Resolution**: This is expected behavior. Model is already saved to cloud.

### "Forbidden" or "403" Error

**Cause**: User lacks edit permission in BIM 360 Docs
**Resolution**: Grant user edit access to the project folder

### WorkItem Success but No Publish

**Cause**: PublishModel endpoint not called
**Resolution**: Check browser console for JavaScript errors

### Publish Command "Pending" Status

**Cause**: Asynchronous processing (normal behavior)
**Resolution**: Model will become available within minutes

## Future Enhancements

1. **Poll PublishModel Job Status**:
   - Add endpoint for `GetPublishModelJob`
   - Show publish progress in UI
   - Confirm when viewable

2. **Webhook Integration**:
   - Receive notifications on publish completion
   - Update UI automatically

3. **Batch Publishing**:
   - Publish multiple models in sequence
   - Queue management

4. **Publish Options**:
   - Select specific views to publish
   - Control sheet publication

## Summary

The complete implementation provides:

✅ **Design Automation**: Opens and saves cloud models  
✅ **PublishModel Integration**: Makes workshared models viewable  
✅ **Graceful Handling**: Works with both model types  
✅ **Automatic Workflow**: Publishes after WorkItem success  
✅ **User Feedback**: Clear logging and error messages  
✅ **Production Ready**: Matches official Autodesk samples  

This is the **complete workflow** for remote Revit Cloud Model publishing via APS.
