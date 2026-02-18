# Firebase Cloud Functions Setup for Scheduled Publishing

This guide explains how to set up Firebase Cloud Functions to enable automatic scheduled publishing of Revit models even when the application is closed.

## Prerequisites

1. Firebase project already created (`revitcloudmodelpublisher`)
2. Node.js 18+ installed
3. Firebase CLI installed: `npm install -g firebase-tools`
4. Firebase Blaze (pay-as-you-go) plan required for Cloud Functions

## Step 1: Upgrade Firebase Plan

Cloud Functions require the Blaze plan:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `revitcloudmodelpublisher`
3. Click on "Upgrade" in the left sidebar
4. Select "Blaze (Pay as you go)" plan
5. Complete the upgrade process

**Cost estimates:**
- Cloud Functions: First 2 million invocations/month are free
- Scheduled function runs every 15 minutes = ~2,880 runs/month (well within free tier)
- Firestore operations: 50K reads + 20K writes/day free

## Step 2: Install Dependencies

In your project root directory:

```powershell
cd functions
npm install
```

This installs:
- `firebase-admin`: Firestore access
- `firebase-functions`: Cloud Functions runtime
- `axios`: HTTP requests to your server

## Step 3: Configure Environment Variables

Set environment variables for your Cloud Functions:

```powershell
# Login to Firebase CLI
firebase login

# Set the server URL (your VM)
firebase functions:config:set server.url="http://34.65.169.15:3000"

# Set authentication key (generate a secure random string)
firebase functions:config:set cloud.auth_key="YOUR_SECURE_RANDOM_KEY_HERE"
```

**Generate a secure auth key:**
```powershell
# PowerShell command to generate random key
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

## Step 4: Update Server Environment Variables

Add the same auth key to your VM's environment:

1. SSH to your VM or edit directly:
   ```bash
   cd ~/revit-publisher
   nano .env
   ```

2. Add this line to `.env`:
   ```
   CLOUD_FUNCTION_AUTH_KEY=YOUR_SECURE_RANDOM_KEY_HERE
   ```

3. Restart the server:
   ```bash
   pm2 restart revit-publisher
   ```

## Step 5: Deploy Firebase Functions

From your project root:

```powershell
# Deploy Cloud Functions
firebase deploy --only functions

# Or deploy everything (functions + firestore rules)
firebase deploy
```

Expected output:
```
✔ Deploy complete!

Functions:
- checkScheduledPublishing(us-central1)
- triggerScheduleCheck(us-central1)
```

## Step 6: Verify Deployment

Check if the function is deployed:

```powershell
firebase functions:list
```

You should see:
- `checkScheduledPublishing` - Runs automatically every 15 minutes
- `triggerScheduleCheck` - HTTP endpoint for manual testing

## Step 7: Test Manual Trigger (Optional)

Test the scheduled function manually:

```powershell
# Get the function URL
firebase functions:config:get

# Call the test endpoint
curl https://us-central1-revitcloudmodelpublisher.cloudfunctions.net/triggerScheduleCheck
```

## Step 8: Update Firestore Security Rules

Deploy the security rules:

```powershell
firebase deploy --only firestore:rules
```

This ensures:
- Users can only read/write their own data
- Cloud Functions can write to publishingLogs
- Proper access control for all collections

## Step 9: Monitor Function Execution

View logs in real-time:

```powershell
firebase functions:log --only checkScheduledPublishing
```

Or view in Firebase Console:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select "Functions" from left sidebar
3. Click on `checkScheduledPublishing`
4. View logs, metrics, and execution history

## How It Works

1. **User sets schedule** in the web app (weekdays, time, timezone)
2. **User clicks "Save Publishing Schedules"** - stores in Firestore
3. **Cloud Function runs every 15 minutes** - `checkScheduledPublishing`
4. **Function checks** all users' schedules against current time
5. **If match found** - Function calls your VM's `/api/designautomation/scheduled-publish` endpoint
6. **Your server** handles the Design Automation API call with stored user tokens
7. **Token refresh** happens automatically if expired (using refresh tokens)
8. **Results logged** in `publishingLogs` collection in Firestore

## Data Structure

### User Document (`users/{userId}`)
```javascript
{
  apsToken: "eyJhbGc...",
  apsRefreshToken: "refresh_token...",
  apsTokenExpiry: 1738451234567,
  sessionId: "abc123",
  lastLogin: 1738447234567,
  publishingSchedules: [
    {
      fileId: "urn:adsk...",
      fileName: "Building_A.rvt",
      days: [1, 2, 3, 4, 5], // Monday-Friday
      time: "09:00",
      timezone: "America/Los_Angeles",
      projectGuid: "b.proj-guid",
      modelGuid: "model-guid",
      region: "US",
      engineVersion: "2024"
    }
  ],
  schedulesUpdated: Timestamp
}
```

### Publishing Log (`publishingLogs/{logId}`)
```javascript
{
  userId: "user123",
  fileId: "urn:adsk...",
  fileName: "Building_A.rvt",
  scheduledTime: "09:00 (America/Los_Angeles)",
  actualTime: "2026-02-18T17:00:00.000Z",
  status: "success" | "error",
  workItemId: "workitem-id",
  response: {...}
}
```

## Troubleshooting

### Function Not Running

Check deployment status:
```powershell
firebase functions:list
```

View errors:
```powershell
firebase functions:log
```

### Authentication Errors

Verify auth key matches:
```powershell
# On VM
cat ~/revit-publisher/.env | grep CLOUD_FUNCTION_AUTH_KEY

# In Firebase
firebase functions:config:get cloud.auth_key
```

### Token Refresh Issues

Users need to re-login periodically to refresh tokens:
1. Refresh tokens typically last 60 days
2. If publishing fails with "Token expired", user must re-login
3. Monitor `publishingLogs` collection for error patterns

### No Schedules Found

Check Firestore:
1. Go to Firebase Console → Firestore Database
2. Navigate to `users/{userId}`
3. Verify `publishingSchedules` array exists and has data

### Function Timeout

Increase timeout (default 60s):
```javascript
// In functions/index.js
exports.checkScheduledPublishing = functions
  .runWith({ timeoutSeconds: 300 }) // 5 minutes
  .pubsub.schedule('*/15 * * * *')
  ...
```

## Cost Monitoring

Monitor usage in Firebase Console:
1. Go to "Usage and billing"
2. Check "Cloud Functions" usage
3. Set up billing alerts

**Estimated monthly costs for typical usage:**
- Cloud Functions: $0 (within free tier)
- Firestore: $0-5 (depends on number of files/users)
- Bandwidth: $0-10 (depends on API calls)

**Total: ~$0-15/month for typical usage**

## Updating the Function

When you make changes to `functions/index.js`:

```powershell
cd functions
npm run lint  # Check for errors
cd ..
firebase deploy --only functions
```

## Disabling Scheduled Publishing

To temporarily disable:

```powershell
# Comment out the function in functions/index.js
# Then redeploy
firebase deploy --only functions
```

Or simply don't save schedules in the UI.

## Support

For issues:
1. Check Firebase Console logs
2. Check VM server logs: `pm2 logs revit-publisher`
3. Review Firestore `publishingLogs` collection for errors
4. Verify environment variables are set correctly

## Next Steps

1. Test with a single file first
2. Monitor logs for first 24 hours
3. Gradually add more scheduled files
4. Set up email alerts for failures (optional)
5. Review monthly costs after first billing cycle
