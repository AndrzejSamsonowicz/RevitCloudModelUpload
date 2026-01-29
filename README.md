# APS Revit Cloud Model Automation

A web application that enables remote triggering of Revit Cloud Model publishing via **Autodesk Platform Services (APS) Design Automation**. This eliminates the need for manual interaction in the Revit desktop app.

## 🎯 What This Does

- **Remotely trigger** Revit automation jobs from a web interface
- **Open Revit Cloud Models** directly by GUID (no file download needed)
- **Run custom logic** in the cloud (parameter updates, validations, etc.)
- **Synchronize** changes back to the cloud model (workshared models)
- **Save** directly to cloud (non-workshared models)
- **🆕 Publish** workshared models to BIM 360 Docs via Data Management API
- **🆕 Automated workflow** - publish happens automatically after successful synchronization

## 🏗️ Architecture

```
┌─────────────────┐
│   Web Browser   │
│   (Frontend)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Node.js Server │────▶│  APS OAuth API   │
│    (Backend)    │     └──────────────────┘
└────────┬────────┘
         │
         ├──────────────────────────────┐
         ▼                              ▼
┌─────────────────────────────┐  ┌──────────────────────┐
│  Design Automation API      │  │ Data Management API  │
│  ┌───────────────────────┐  │  │ ┌──────────────────┐ │
│  │ AppBundle: Revit      │  │  │ │ PublishModel     │ │
│  │ Activity:  Publish    │  │  │ │ Command          │ │
│  │ WorkItem:  Execute    │  │  │ └──────────────────┘ │
│  └───────────────────────┘  │  └──────────────────────┘
└────────────┬────────────────┘
             │
             ▼
     ┌───────────────┐
     │ Revit Cloud   │
     │ Model (RCW)   │
     └───────────────┘
```

## 📋 Prerequisites

### For Development
- **Node.js** 16+ (for backend)
- **Visual Studio 2019+** (for Revit AppBundle)
- **.NET Framework 4.8** SDK
- **Revit 2024/2025/2026** SDK (or your target version)

### For Deployment
- **Autodesk APS Account** - [Create one here](https://aps.autodesk.com)
- **Public webhook URL** (use ngrok for local testing)

## 🚀 Quick Start

### 1. Clone & Install

```powershell
cd c:\MCPServer\RevitAutomation
npm install
```

### 2. Configure APS Credentials

1. Go to [APS Portal](https://aps.autodesk.com/myapps) and create a new app
2. Enable the following APIs:
   - **Design Automation API**
   - **Data Management API**
3. Set callback URL to: `http://localhost:3000/oauth/callback`
4. Copy `.env.template` to `.env`:

```powershell
cp .env.template .env
```

5. Edit `.env` and add your credentials:

```env
APS_CLIENT_ID=your_client_id_here
APS_CLIENT_SECRET=your_client_secret_here
APS_CALLBACK_URL=http://localhost:3000/oauth/callback
DESIGN_AUTOMATION_NICKNAME=mycompany
PORT=3000
WEBHOOK_URL=http://localhost:3000/webhooks/design-automation
```

### 3. Build Revit AppBundle

```powershell
cd RevitAppBundle
dotnet build -c Release
```

This creates `bin\Release\RevitCloudPublisher.zip`

### 4. Start the Server

```powershell
cd ..
npm start
```

Server runs at: **http://localhost:3000**

### 5. Setup Workflow (First Time)

1. **Login**: Click "Login with Autodesk" and authorize
2. **Set Nickname**: Enter a unique nickname (e.g., your company name)
3. **Upload AppBundle**: Upload the `RevitCloudPublisher.zip` file
4. **Create Activity**: Click "Create Activity" to register the workflow

### 6. Publish a Cloud Model

1. Get your Revit Cloud Model details:
   - **Region**: US or EMEA
   - **Project GUID**: From ACC/BIM 360
   - **Model GUID**: From the cloud model URL
2. Enter these in the "Publish Cloud Model" section
3. Click **🚀 Publish Cloud Model**
4. Monitor the log for status updates

## 📁 Project Structure

```
RevitAutomation/
├── server.js                    # Express server entry point
├── package.json                 # Node.js dependencies
├── .env.template                # Environment variables template
├── .gitignore                   
│
├── routes/
│   ├── auth.js                  # OAuth 3-legged flow
│   ├── designAutomation.js      # DA API endpoints
│   └── webhooks.js              # Webhook callbacks
│
├── services/
│   ├── apsClient.js             # APS OAuth client
│   └── designAutomation.js      # Design Automation service
│
├── public/
│   ├── index.html               # Web UI
│   └── app.js                   # Frontend JavaScript
│
└── RevitAppBundle/
    ├── RevitCloudPublisherApp.cs   # C# Revit automation logic
    ├── RevitCloudPublisher.csproj  # .NET project file
    ├── PackageContents.xml         # Revit add-in manifest
    └── README.md                   # Build instructions
```

## 🔧 API Endpoints

### Authentication
- `GET /oauth/login` - Initiate OAuth flow
- `GET /oauth/callback` - OAuth callback handler
- `GET /oauth/session/:sessionId` - Check session status
- `POST /oauth/logout/:sessionId` - Logout

### Design Automation
- `POST /api/design-automation/setup/nickname` - Set DA nickname
- `POST /api/design-automation/appbundle/upload` - Upload AppBundle
- `POST /api/design-automation/activity/create` - Create Activity
- `POST /api/design-automation/workitem/create` - Create WorkItem (trigger job)
- `GET /api/design-automation/workitem/:id/status` - Get WorkItem status

### Data Management (🆕)
- `GET /api/data-management/hubs` - List hubs
- `GET /api/data-management/hubs/:hubId/projects` - List projects
- `GET /api/data-management/projects/:projectId/topFolders` - List folders
- `GET /api/data-management/projects/:projectId/folders/:folderId/rvtFiles` - Find Revit cloud models
- `POST /api/data-management/publish/:itemId` - 🆕 Publish workshared model to BIM 360 Docs
- `POST /api/data-management/publish-status/:itemId` - 🆕 Check publish job status

### Webhooks
- `POST /webhooks/design-automation` - DA completion callback
- `GET /webhooks/result/:workItemId` - Get webhook result

## 🛠️ Customizing the Revit Logic

Edit [RevitAppBundle/RevitCloudPublisherApp.cs](RevitAppBundle/RevitCloudPublisherApp.cs):

```csharp
private bool ProcessCloudModel(DesignAutomationData data)
{
    Document doc = data.RevitDoc;
    
    using (Transaction trans = new Transaction(doc, "Custom Logic"))
    {
        trans.Start();
        
        // YOUR CUSTOM CODE HERE
        // Example: Update parameters
        FilteredElementCollector collector = new FilteredElementCollector(doc);
        foreach (Element elem in collector.OfClass(typeof(Wall)))
        {
            Parameter param = elem.LookupParameter("Comments");
            if (param != null && !param.IsReadOnly)
            {
                param.Set("Processed by automation");
            }
        }
        
        trans.Commit();
    }
    
    // Sync changes back to cloud
    doc.SynchronizeWithCentral(transactOptions, syncOptions);
    return true;
}
```

After modifying:
1. Rebuild: `dotnet build -c Release`
2. Re-upload via web UI

## 🌐 Production Deployment

### 1. Setup Public Webhook URL

For production, you need a public URL for webhooks:

**Option A: Cloud Hosting (Azure, AWS, Heroku)**
```env
WEBHOOK_URL=https://your-app.azurewebsites.net/webhooks/design-automation
```

**Option B: ngrok (for testing)**
```powershell
ngrok http 3000
# Use the generated URL in .env
WEBHOOK_URL=https://abc123.ngrok.io/webhooks/design-automation
```

### 2. Update APS App Callback URL

In [APS Portal](https://aps.autodesk.com/myapps), update:
- Callback URL: `https://your-domain.com/oauth/callback`

### 3. Environment Variables

Set all required variables:
```env
NODE_ENV=production
APS_CLIENT_ID=your_production_client_id
APS_CLIENT_SECRET=your_production_secret
APS_CALLBACK_URL=https://your-domain.com/oauth/callback
WEBHOOK_URL=https://your-domain.com/webhooks/design-automation
```

### 4. Security Considerations

- Use **Redis** or **database** for session storage (not in-memory Map)
- Enable **HTTPS** with valid SSL certificate
- Implement **rate limiting**
- Add **authentication middleware**
- Store tokens securely (encrypt at rest)

## 🐛 Troubleshooting

### "OAuth authentication failed"
- Verify `APS_CLIENT_ID` and `APS_CLIENT_SECRET` in `.env`
- Check callback URL matches APS app settings

### "AppBundle upload failed"
- Ensure ZIP file contains `Contents/` folder with DLL and PackageContents.xml
- Verify Revit SDK version matches engine version

### "WorkItem failed"
- Check webhook logs for detailed error messages
- Verify cloud model GUIDs are correct
- Ensure user has access to the cloud model (3-legged token)
- Review Design Automation report URL for stack traces

### Webhooks not received
- For local dev, use ngrok to expose localhost
- Verify `WEBHOOK_URL` is publicly accessible
- Check firewall settings

### "PublishModel only applies to workshared cloud models"
- This is **expected behavior** for non-workshared models
- Non-workshared models are saved directly to cloud via `SaveCloudModel()`
- Only workshared (C4R) models support the PublishModel command
- Both model types work correctly - this is just an informational message

### "Model is not workshared"
- Cloud models must be workshared to use `SynchronizeWithCentral()`
- Non-workshared models use `SaveCloudModel()` - already saved to cloud
- PublishModel step is skipped for non-workshared models (graceful handling)

## 📚 Resources

### Official Documentation
- [APS Design Automation Docs](https://aps.autodesk.com/en/docs/design-automation/v3/developers_guide/overview/)
- [Revit Cloud Model Integration](https://aps.autodesk.com/en/docs/design-automation/v3/developers_guide/revit_specific/revit-cloud-model-integration/)
- [PublishModel API Reference](https://aps.autodesk.com/en/docs/data/v2/reference/http/PublishModel/)
- [Data Management API](https://aps.autodesk.com/en/docs/data/v2/)

### Samples & Tutorials
- [Revit Cloud Models Sample](https://github.com/autodesk-platform-services/aps-revit-rcw-parameters-exchange)
- [PublishModel Tutorial](https://aps.autodesk.com/en/docs/data/v2/tutorials/publish-model/)
- [APS Code Samples](https://aps.autodesk.com/code-samples)

### Project Documentation
- [📘 PublishModel Workflow](./PUBLISH_MODEL_WORKFLOW.md) - Complete workflow guide
- [📗 API Reference](./API_REFERENCE_PUBLISHMODEL.md) - PublishModel endpoints
- [📙 Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Feature overview
- [📕 Build Instructions](./RevitAppBundle/README.md) - AppBundle compilation

## 📄 License

MIT

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## ⚠️ Important Notes

- **Cloud Models Only**: This workflow is designed for Revit Cloud Models (RCW format)
- **Permissions**: Users must have appropriate permissions on the cloud model
- **Publishing**: ✅ **Fully Implemented** - PublishModel integration complete
- **Model Types**: 
  - **Workshared (C4R)**: Full workflow with PublishModel
  - **Non-workshared**: SaveCloudModel only (no PublishModel needed)
- **Costs**: APS Design Automation usage may incur costs based on your plan

## 🔐 Security Best Practices

1. **Never commit** `.env` file
2. **Rotate** credentials regularly
3. **Use** environment-specific credentials (dev/staging/prod)
4. **Validate** all user inputs
5. **Implement** proper error handling
6. **Log** security events

---

**Need Help?** Open an issue or refer to the [APS Community](https://aps.autodesk.com/community)
