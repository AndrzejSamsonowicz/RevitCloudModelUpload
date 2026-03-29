# VM Deployment Guide

## Prerequisites
- Google VM instance running
- VM has public IP address or domain name
- SSH access to the VM
- Node.js installed on VM
- Git installed on VM

## Quick Deployment (Recommended)

Use the automated deployment script:

```powershell
.\deploy-to-vm.ps1 "Your commit message"
```

This will:
1. Commit and push changes to GitHub
2. Generate encryption key (if needed)
3. Provide step-by-step VM deployment instructions
4. Copy deployment command to clipboard

## Manual Deployment Steps

### 1. Connect to VM

**Option A - Google Cloud Console (Recommended):**
1. Go to: https://console.cloud.google.com
2. Navigate to: Compute Engine → VM instances
3. Click SSH button next to your VM

**Option B - Direct SSH:**
```bash
ssh samson090281@34.65.169.15
```

### 2. Navigate to project directory and pull latest code
```bash
cd ~/revit-publisher
git pull origin master
```

### 3. Install/update dependencies
```bash
npm install
```

### 4. Update .env file with VM's public URL
```bash
nano .env  # or vim .env
```

**Critical change:**
```env
# BEFORE (localhost - doesn't work for webhooks):
WEBHOOK_URL=http://localhost:3000/webhooks/design-automation

# AFTER (use your VM's public IP or domain):
WEBHOOK_URL=http://YOUR_VM_PUBLIC_IP:3000/webhooks/design-automation
# OR if you have a domain:
WEBHOOK_URL=https://yourdomain.com/webhooks/design-automation
```

### 5. Configure Encryption Key (First Time Setup)

**Generate key on local machine:**
```bash
node generate-encryption-key.js
```

**Add to VM's .env file:**
```bash
nano .env
```

Add this line (replace with your generated key):
```env
ENCRYPTION_KEY=your_generated_hex_key_here
```

Save and exit (Ctrl+X, Y, Enter).

**Configure Cloud Functions (run on local machine):**
```bash
firebase functions:config:set encryption.key="your_generated_hex_key_here"
firebase deploy --only functions
```

⚠️ **Important**: Use the SAME key for both VM and Cloud Functions!

### 6. Ensure Firebase credentials are present
```bash
# Check if Firebase service account file exists
ls -la revitcloudmodelpublisher-firebase-adminsdk-*.json

# If missing, upload it from your local machine:
# (Run this from your LOCAL machine, not on VM)
# scp revitcloudmodelpublisher-firebase-adminsdk-fbsvc-91a99e0dbe.json samson090281@34.65.169.15:~/revit-publisher/
```

### 7. Restart the server
```bash
# Restart with pm2 (recommended)
pm2 restart revit-publisher

# View logs to verify
pm2 logs revit-publisher --lines 30

# Alternative: Stop and start
pm2 stop revit-publisher
pm2 start server.js --name revit-publisher
pm2 save
```

### 8. Verify deployment
```bash
# Check if server is running
pm2 status

# Check server responds
curl http://localhost:3000/health

# Monitor logs
pm2 logs revit-publisher
```

**Test encryption:**
- Create a schedule in UI
- Check browser console for: `✓ Schedules encrypted successfully`
- Check Firestore: data should be encrypted (hex strings)
- Reload page: schedules should display correctly (decrypted)

### 9. Test complete deployment
1. Log into the app: https://rvtpub.digibuild.ch
2. Create a scheduled publish
3. Check browser console for encryption confirmation
4. Wait for Cloud Function to trigger
5. Verify Publishing History updates automatically
6. Check that schedules decrypt correctly on page reload

## Firewall Configuration

Ensure port 3000 is open for incoming connections:

**Google Cloud:**
```bash
gcloud compute firewall-rules create allow-revit-publisher \
  --allow tcp:3000 \
  --description "Allow access to Revit Publisher app"
```

**Or via Google Cloud Console:**
1. Go to VPC Network → Firewall
2. Create rule to allow TCP port 3000

## Cloud Functions

Cloud Functions are already deployed to Firebase. No action needed on VM.

Current functions:
- `checkScheduledPublishing` - Runs every 5 minutes
- `checkWorkItemStatus` - Runs every 2 minutes (checks pending workitems)
- `triggerScheduleCheck` - Manual trigger endpoint
- `triggerWorkItemCheck` - Manual trigger endpoint

## Troubleshooting

### Webhooks not updating logs
**Check:**
1. VM's public IP is accessible from internet: `curl -I http://YOUR_VM_IP:3000`
2. WEBHOOK_URL in .env matches VM's public address
3. Port 3000 is open in firewall
4. Server logs show webhook POST requests arriving

**Verify webhook URL:**
```bash
grep WEBHOOK_URL .env
```

### Check server logs
```bash
pm2 logs revit-publisher --lines 100
# OR if running directly:
tail -f /path/to/your/log/file
```

### Manually update pending logs (if needed)
```bash
curl -X POST http://localhost:3000/api/workitem-status/update-pending-dev
```

## Environment Variables Checklist

Ensure these are set in `.env` on the VM:

- ✅ `PORT=3000`
- ✅ `WEBHOOK_URL=http://34.65.169.15:3000/webhooks/design-automation`
- ✅ `FIREBASE_SERVICE_ACCOUNT_PATH=./revitcloudmodelpublisher-firebase-adminsdk-*.json`
- ✅ `CLOUD_FUNCTION_AUTH_KEY=your-secure-key`
- ✅ `APS_CALLBACK_URL=https://rvtpub.digibuild.ch/oauth/callback`
- ✅ `APP_URL=https://rvtpub.digibuild.ch`
- ✅ `ENCRYPTION_KEY=your-generated-hex-key` **(NEW - Required for data encryption)**

## Success Criteria

✅ Server accessible at https://rvtpub.digibuild.ch
✅ Users can log in
✅ Scheduled publishes trigger automatically
✅ Publishing History updates automatically (no stuck "pending" entries)
✅ File type badges display correctly (RCM purple, C4R teal)
✅ Error messages are clear and helpful
✅ Schedule data encrypted in Firestore (hex strings for fileName/projectName)
✅ Schedules decrypt correctly when loading UI
✅ Cloud Functions decrypt schedules successfully (check logs)

## Next Steps After Deployment

1. Test with both users (admin and regular user)
2. Verify scheduled publishing works
3. Check Publishing History auto-refresh
4. Monitor for any errors in logs
5. Consider setting up HTTPS with SSL certificate
