# Deployment Steps for VM

## ✅ GitHub Push Complete

Changes have been successfully pushed to GitHub:
- Commit: `eb76e4e`
- Branch: `master`
- Repository: `https://github.com/AndrzejSamsonowicz/RevitCloudModelUpload.git`

---

## 🚀 Deploy to VM

**SSH into your VM:**

```bash
ssh user@34.65.169.15
```

**Run these commands:**

```bash
cd ~/revit-publisher
git pull origin master
pm2 restart revit-publisher
pm2 logs --lines 30
```

---

## 📋 What's Being Deployed

### 1. **Scheduled Publishing Fix** 🔧
   - Fixed: Scheduled publishes now appear in ACC "Revit Cloud Models" section
   - Root cause: PublishModel was called before WorkItem completed
   - Solution: Webhook now calls PublishModel after WorkItem succeeds

### 2. **Security Enhancements** 🔒
   - OAuth session IDs now use URL fragment (not query string)
   - Session data no longer appears in HTTP logs/referrers
   - Fixed error handler stack trace exposure condition

### 3. **VM Documentation** 📚
   - Added `VM_COMMANDS.md` with common commands
   - Added `deploy-security-fix.sh` deployment script

---

## ✅ Verification Steps

After deployment, verify:

1. **Server is running:**
   ```bash
   pm2 status
   ```

2. **No errors in logs:**
   ```bash
   pm2 logs revit-publisher --lines 50
   ```

3. **Test scheduled publish:**
   - Create a test schedule for a few minutes from now
   - Wait for it to execute
   - Check ACC "Revit Cloud Models" section - model should appear

4. **Test manual publish:**
   - Publish a cloud model manually
   - Should work as before

---

## 🔍 Monitoring

Check logs for these success indicators:
- `✓ Stored metadata for WorkItem` - Metadata storage working
- `[Webhook] ✓ PublishModel command initiated` - PublishModel triggered after WorkItem succeeds
- No CORS errors
- No "Dangerous site" warnings

---

## 🆘 Rollback (If Needed)

If something goes wrong:

```bash
cd ~/revit-publisher
git log --oneline -5
git checkout 40fd879  # Previous working commit
pm2 restart revit-publisher
```

---

## 📞 Support

If issues persist:
1. Check `pm2 logs revit-publisher --err` for errors
2. Verify environment variables are set: `cat .env | grep -v SECRET | grep -v KEY`
3. Check server health: `curl http://localhost:3000/health`
