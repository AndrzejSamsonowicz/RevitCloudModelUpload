# VM Deployment Guide

## Prerequisites
- Google VM instance running
- VM has public IP address or domain name
- SSH access to the VM
- Node.js installed on VM
- Git installed on VM

## Deployment Steps

### 1. Connect to VM
```bash
# Replace with your VM connection command
gcloud compute ssh your-vm-name --zone=your-zone
# OR
ssh username@your-vm-ip
```

### 2. Navigate to project directory and pull latest code
```bash
cd ~/RevitAutomation  # Or wherever your project is
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

### 5. Ensure Firebase credentials are present
```bash
# Check if Firebase service account file exists
ls -la revitcloudmodelpublisher-firebase-adminsdk-*.json

# If missing, upload it from your local machine:
# (Run this from your LOCAL machine, not on VM)
# scp revitcloudmodelpublisher-firebase-adminsdk-fbsvc-91a99e0dbe.json username@vm-ip:~/RevitAutomation/
```

### 6. Restart the server
```bash
# Stop existing process
pm2 stop server
# OR
pkill -f "node server.js"

# Start with pm2 (recommended for production)
pm2 start server.js --name revit-publisher
pm2 save

# OR start directly
node server.js &
```

### 7. Verify deployment
```bash
# Check if server is running
pm2 status
# OR
curl http://localhost:3000

# Check logs
pm2 logs revit-publisher
```

### 8. Test webhooks
1. Log into the app: http://YOUR_VM_IP:3000
2. Set up a scheduled publish
3. Wait for it to trigger
4. Check Publishing History - it should automatically update from "pending" to "success"/"error"

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
- ✅ `WEBHOOK_URL=http://YOUR_VM_PUBLIC_IP:3000/webhooks/design-automation`
- ✅ `FIREBASE_SERVICE_ACCOUNT_PATH=./revitcloudmodelpublisher-firebase-adminsdk-*.json`
- ✅ `CLOUD_FUNCTION_AUTH_KEY=your-secure-key`
- ✅ `APS_CALLBACK_URL=http://YOUR_VM_PUBLIC_IP:3000/oauth/callback`
- ✅ `APP_URL=http://YOUR_VM_PUBLIC_IP:3000`

## Success Criteria

✅ Server accessible at http://YOUR_VM_IP:3000
✅ Users can log in
✅ Scheduled publishes trigger automatically
✅ Publishing History updates automatically (no stuck "pending" entries)
✅ File type badges display correctly (RCM purple, C4R teal)
✅ Error messages are clear and helpful

## Next Steps After Deployment

1. Test with both users (admin and regular user)
2. Verify scheduled publishing works
3. Check Publishing History auto-refresh
4. Monitor for any errors in logs
5. Consider setting up HTTPS with SSL certificate
