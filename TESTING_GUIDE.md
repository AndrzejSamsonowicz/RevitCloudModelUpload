# Quick Start Guide - Testing PublishModel Integration

## 🚀 Complete Workflow Test

This guide walks through testing the complete PublishModel integration from start to finish.

---

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] Node.js installed (v16+)
- [ ] VS Build Tools 2022 installed
- [ ] AppBundle v28 built (`RevitCloudPublisher.zip`)
- [ ] `.env` file configured with APS credentials
- [ ] Server running on http://localhost:3000
- [ ] Access to BIM 360 or ACC project with Revit cloud models

---

## Step 1: Start Server

```powershell
cd C:\MCPServer\RevitAutomation
node server.js
```

**Expected Output**:
```
✓ Server running on http://localhost:3000
✓ Environment: development
✓ APS Client ID: ***BfAd
```

---

## Step 2: Login with Autodesk

1. Open browser: **http://localhost:3000**
2. Click **"Login with Autodesk"**
3. Authorize the application
4. Verify "✓ Logged in successfully"

**What happens**:
- 3-legged OAuth flow completes
- Session token stored
- User profile retrieved

---

## Step 3: Setup Design Automation (First Time Only)

### 3a. Set Nickname

1. Enter a unique nickname (e.g., "MyCompany2026")
2. Click **"Set Nickname"**
3. Wait for success message

**Expected**:
```
✓ Nickname set successfully
```

### 3b. Upload AppBundle

1. Click **"Choose File"**
2. Select `RevitAppBundle/RevitCloudPublisher.zip`
3. Click **"Upload AppBundle"**
4. Wait for upload to complete

**Expected**:
```
✓ AppBundle created: MyCompany2026.RevitCloudPublisher+production
✓ Upload complete
✓ AppBundle alias updated: version 28
```

### 3c. Create Activity

1. Select Revit version: **2026** (or your target version)
2. Click **"Create Activity"**
3. Wait for confirmation

**Expected**:
```
✓ Activity created: MyCompany2026.PublishCloudModelActivity+production
```

---

## Step 4: Select Cloud Model

### 4a. Select Hub
1. Click **"Select Hub"** dropdown
2. Choose your BIM 360 or ACC hub
3. Wait for projects to load

### 4b. Select Project
1. Click **"Select Project"** dropdown
2. Choose project with Revit cloud models
3. Wait for folders to load

### 4c. Browse Folder
1. Click **"Select Folder"** dropdown
2. Choose folder containing `.rvt` files
3. Click **"Search for Models"**
4. Wait for models to appear

**Expected**:
```
Found 3 Revit cloud model(s)
```

### 4d. Select Model
1. Click **"Select a Revit Cloud Model"** dropdown
2. Choose your test model
3. Verify GUIDs auto-populate

**Auto-filled fields**:
- Project GUID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- Model GUID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## Step 5: Trigger Publish

1. Verify all fields filled
2. Click **🚀 Publish Cloud Model**
3. Monitor the log section

---

## Step 6: Monitor Progress

### Phase 1: WorkItem Creation
```
[14:23:10] WorkItem created: abc-123-def-456
[14:23:10] Status: pending
```

### Phase 2: Revit Processing
```
[14:23:15] Status update: inprogress
[14:23:30] Status update: inprogress
```

### Phase 3: WorkItem Success
```
[14:23:45] Status update: success
[14:23:45] ✓ WorkItem completed with status: success
[14:23:45] Report: https://dasprod-store.s3.amazonaws.com/...
```

### Phase 4: PublishModel (Automatic)

**For Workshared Models**:
```
[14:23:45] Initiating model publish to BIM 360 Docs...
[14:23:45] Publishing model (itemId: urn:adsk.wip:dm.lineage:...)...
[14:23:46] ✓ Publish command initiated (ID: d3bbe753-ae0a-450d-bbe3-cfd4648f0437)
[14:23:46] Initial status: committed
[14:23:46] Model will be available in BIM 360 Docs shortly
```

**For Non-Workshared Models**:
```
[14:23:45] Initiating model publish to BIM 360 Docs...
[14:23:45] Publishing model (itemId: urn:adsk.wip:dm.lineage:...)...
[14:23:46] ℹ Note: PublishModel only applies to workshared cloud models
[14:23:46] ℹ Non-workshared models are already saved to cloud
```

---

## Step 7: Verify Results

### Option A: Check WorkItem Report (All Models)

1. Click the report URL in the log
2. Look for success indicators:
   ```json
   {
     "status": "success",
     "stats": {
       "timeQueued": "00:00:05",
       "timeInstructionExecution": "00:00:30"
     }
   }
   ```

### Option B: Check BIM 360 Docs (Workshared Models Only)

1. Open BIM 360 Docs or ACC
2. Navigate to your project
3. Check the model's version history
4. Verify new published version appears
5. Confirm model is viewable in web viewer

### Option C: Check Model in Revit Desktop (All Models)

1. Open Revit Desktop
2. Open cloud model
3. For workshared: Check synchronization status
4. For non-workshared: Changes should be visible

---

## Expected Results by Model Type

### Workshared (C4R) Models

| Step | Expected Behavior |
|------|------------------|
| **Design Automation** | Opens model, synchronizes with central |
| **WorkItem Status** | `success` |
| **PublishModel** | Command initiated successfully |
| **BIM 360 Docs** | New published version created |
| **Viewable** | Model viewable in web browser |

**Timeline**: 30-60 seconds for WorkItem + 2-5 minutes for publish

### Non-Workshared Models

| Step | Expected Behavior |
|------|------------------|
| **Design Automation** | Opens model, saves to cloud |
| **WorkItem Status** | `success` |
| **PublishModel** | Informational message (not applicable) |
| **Cloud Storage** | Model saved directly |
| **Access** | Immediately available |

**Timeline**: 30-60 seconds for WorkItem

---

## Troubleshooting Test Scenarios

### Test Case 1: Invalid Model GUID

**Input**: Wrong model GUID  
**Expected**: WorkItem fails with error message  
**Log**:
```
[14:23:15] ✗ WorkItem completed with status: failed
[14:23:15] Error: Could not find cloud model
```

### Test Case 2: Expired Session

**Input**: Clear cookies and retry  
**Expected**: Authentication error  
**Response**:
```json
{
  "error": "Invalid or expired session"
}
```

### Test Case 3: No Permission

**Input**: Model in project without access  
**Expected**: Permission denied error  
**Log**:
```
[14:23:15] ✗ WorkItem completed with status: failed
[14:23:15] Error: User does not have permission
```

### Test Case 4: Network Interruption

**Input**: Disconnect internet during WorkItem  
**Expected**: Polling timeout  
**Log**:
```
[14:28:15] Polling timeout - check webhook results
```

---

## Performance Benchmarks

### Typical Execution Times

| Operation | Duration | Notes |
|-----------|----------|-------|
| **Login** | 2-5 sec | OAuth redirect |
| **Load Hubs** | 1-2 sec | API call |
| **Load Projects** | 1-3 sec | Depends on hub size |
| **Search Models** | 2-5 sec | Folder traversal |
| **WorkItem Queue** | 5-15 sec | Before processing starts |
| **WorkItem Execute** | 20-60 sec | Depends on model size |
| **PublishModel Initiate** | 1-2 sec | Command submission |
| **PublishModel Complete** | 2-5 min | Background processing |

**Total Time (Workshared)**: ~3-6 minutes  
**Total Time (Non-workshared)**: ~30-90 seconds

---

## Test Checklist

### Initial Setup
- [ ] Server starts without errors
- [ ] Login redirects to Autodesk
- [ ] Session token stored
- [ ] Nickname set successfully
- [ ] AppBundle uploads (v28, ~232 KB)
- [ ] Activity created

### Model Selection
- [ ] Hubs load
- [ ] Projects load for selected hub
- [ ] Folders load for selected project
- [ ] Revit models found in folder
- [ ] GUIDs auto-populate on selection

### Execution
- [ ] WorkItem creates successfully
- [ ] Status polling works
- [ ] WorkItem completes with "success"
- [ ] Report URL accessible

### PublishModel (Workshared)
- [ ] Publish initiated automatically
- [ ] Command ID returned
- [ ] Status shows "committed"
- [ ] Model appears in BIM 360 Docs
- [ ] New version number incremented

### PublishModel (Non-Workshared)
- [ ] Informational message shown
- [ ] Workflow completes gracefully
- [ ] Model accessible in cloud

### Error Handling
- [ ] Invalid credentials rejected
- [ ] Missing GUIDs caught
- [ ] Network errors handled
- [ ] Graceful degradation works

---

## Advanced Testing

### Browser Console Testing

Open Developer Tools (F12) and check:

```javascript
// Check session
console.log(sessionStorage.getItem('sessionId'));

// Manual publish test
const itemId = 'urn:adsk.wip:dm.lineage:...';
const projectId = 'b.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

fetch(`/api/data-management/publish/${encodeURIComponent(itemId)}`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionStorage.getItem('sessionId')}`
    },
    body: JSON.stringify({ projectId })
})
.then(r => r.json())
.then(console.log);
```

### API Testing with cURL

```bash
# Test publish endpoint
curl -X POST \
  "http://localhost:3000/api/data-management/publish/urn%3Aadsk.wip%3Adm.lineage%3A..." \
  -H "Authorization: Bearer YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"b.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}'

# Test publish status
curl -X POST \
  "http://localhost:3000/api/data-management/publish-status/urn%3Aadsk.wip%3Adm.lineage%3A..." \
  -H "Authorization: Bearer YOUR_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"b.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}'
```

---

## Success Criteria

### ✅ Complete Success

All of the following should work:

1. ✅ Login completes without errors
2. ✅ AppBundle uploads successfully
3. ✅ Activity creates successfully
4. ✅ Cloud models discovered via Data Management API
5. ✅ WorkItem executes and returns "success"
6. ✅ For workshared: PublishModel initiates
7. ✅ For non-workshared: Graceful message shown
8. ✅ Report accessible and shows success
9. ✅ Model accessible in ACC/BIM 360

### 📊 Metrics to Track

- **Success Rate**: Target 95%+
- **Average Execution Time**: <90 seconds
- **Error Recovery**: All errors logged and explained
- **User Feedback**: Clear, actionable messages

---

## Next Steps After Successful Test

1. **Document Your Results**: Note execution times and any issues
2. **Test Different Model Types**: Both workshared and non-workshared
3. **Test Different Revit Versions**: If supporting multiple versions
4. **Test Error Scenarios**: Invalid inputs, permissions, etc.
5. **Production Deployment**: Follow deployment guide
6. **Setup Monitoring**: Implement logging and alerts
7. **User Training**: Document workflow for end users

---

## Support

If you encounter issues:

1. **Check Server Logs**: Terminal where `node server.js` is running
2. **Check Browser Console**: F12 Developer Tools
3. **Review Documentation**: 
   - [PUBLISH_MODEL_WORKFLOW.md](./PUBLISH_MODEL_WORKFLOW.md)
   - [API_REFERENCE_PUBLISHMODEL.md](./API_REFERENCE_PUBLISHMODEL.md)
4. **Check APS Status**: https://health.autodesk.com/
5. **Verify Credentials**: Ensure `.env` file is correct

---

## Testing Completed! 🎉

If all tests pass, you have a **fully functional** Revit Cloud Model automation system with complete PublishModel integration!

**What you can do now**:
- Remotely trigger Revit cloud model synchronization
- Automatically publish workshared models to BIM 360 Docs
- Process non-workshared models with graceful handling
- Monitor execution via real-time logs
- Scale to production workflows

**Status**: ✅ **PRODUCTION READY**
