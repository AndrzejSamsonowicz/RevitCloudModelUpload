# Quick Setup: Encryption for Scheduled Publishing

This guide helps you quickly set up encryption for scheduled publishing data.

## What You Need

1. Backend server access (VM)
2. Firebase CLI (for Cloud Functions)
3. 5-10 minutes

## Step-by-Step Setup

### Step 1: Generate Encryption Key

On your local machine or server:

```bash
cd c:\MCPServer\RevitAutomation
node generate-encryption-key.js
```

**Save the generated key securely!** You'll need it for the next steps.

### Step 2: Configure Backend Server (VM)

SSH into your VM:

```bash
ssh samson090281@34.65.169.15
cd ~/revit-publisher
```

Create or edit `.env` file:

```bash
nano .env
```

Add this line (replace with your actual key):

```
ENCRYPTION_KEY=858c0f3ac8801fd4e8c9c8ddcb8208fba2fbde76367470abcc7e2bac170a36c6
```

Save and exit (Ctrl+X, then Y, then Enter).

Restart the server:

```bash
pm2 restart revit-publisher
pm2 logs --lines 20
```

### Step 3: Configure Firebase Cloud Functions

On your local machine:

```bash
cd c:\MCPServer\RevitAutomation

# Set the encryption key in Firebase config
firebase functions:config:set encryption.key="YOUR_KEY_HERE"

# Verify it's set
firebase functions:config:get

# Deploy the updated functions
firebase deploy --only functions
```

### Step 4: Verify Encryption is Working

1. Open your app: https://rvtpub.digibuild.ch
2. Log in and navigate to a project
3. Create or edit a schedule
4. Save the schedule
5. Check browser console (F12) - you should see: `✓ Schedules encrypted successfully`
6. Check Firestore in Firebase Console:
   - Navigate to your user document
   - Look at `publishingSchedules` array
   - File names and project names should look like: `a1b2c3d4...:xyz123...:9876543...`

### Step 5: Test Decryption

1. Refresh the page (F5)
2. Navigate back to the project
3. Check that schedules display correctly with readable file names
4. Browser console should show: `✓ Schedules decrypted successfully`

## Troubleshooting

### Issue: Schedules show encrypted strings

**Problem**: File names appear as long hex strings instead of readable names.

**Solution**:
- Check that `ENCRYPTION_KEY` is set on backend server
- Verify both server and Cloud Functions use the SAME key
- Check browser console for errors
- Restart the backend server

### Issue: "Encryption failed" warning

**Problem**: Warning message when saving schedules.

**Solution**:
- Ensure backend server is running: `pm2 status`
- Test encryption endpoint: `curl http://localhost:3000/api/encryption/encrypt-schedules -X POST -H "Content-Type: application/json" -d '{"schedules":[]}'`
- Check server logs: `pm2 logs revit-publisher`

### Issue: Scheduled publishing doesn't run

**Problem**: Cloud Function doesn't execute schedules.

**Solution**:
- Check Cloud Functions logs: `firebase functions:log`
- Verify encryption key is set: `firebase functions:config:get`
- Ensure key matches between VM and Cloud Functions
- Redeploy functions: `firebase deploy --only functions`

## Security Checklist

- [ ] Encryption key generated
- [ ] Key stored securely (password manager)
- [ ] Key added to VM `.env` file
- [ ] Key added to Firebase Functions config
- [ ] Backend server restarted
- [ ] Cloud Functions redeployed
- [ ] Encryption verified (check Firestore)
- [ ] Decryption verified (page reload)
- [ ] `.env` file is in `.gitignore` (never commit the key!)

## What Gets Encrypted

✅ **Encrypted**:
- File names in scheduled publishing
- Project names in scheduled publishing

❌ **NOT Encrypted** (not sensitive):
- File IDs
- Project IDs
- Model GUIDs
- Time schedules
- Timezone settings
- Day selections

## Need Help?

See the full documentation: [ENCRYPTION_GUIDE.md](./ENCRYPTION_GUIDE.md)

---

**Setup Time**: ~5 minutes  
**Security Level**: AES-256-GCM encryption  
**Compatibility**: Backward compatible with unencrypted data
