# Automated Deployment Scripts

## Prerequisites

1. **SSH Key Setup** (one-time):
   ```powershell
   # Generate SSH key if you don't have one
   ssh-keygen -t ed25519 -C "your_email@example.com"
   
   # Copy public key
   Get-Content ~\.ssh\id_ed25519.pub
   ```

2. **Add SSH Key to Google Cloud**:
   - Go to: https://console.cloud.google.com
   - Navigate to: **Compute Engine** → **Metadata** → **SSH Keys**
   - Click **Edit** → **Add Item**
   - Paste your public key → **Save**

3. **Test SSH Connection**:
   ```powershell
   ssh -i ~\.ssh\id_ed25519 samson090281@34.65.169.15
   ```

---

## Deployment Scripts

### Option 1: Full Deploy (with commit)

**Stages all changes, commits, pushes to GitHub, and deploys to VM**

```powershell
.\deploy-to-vm.ps1 "Your commit message here"
```

**Example:**
```powershell
.\deploy-to-vm.ps1 "Fix scheduled publishing bug"
```

---

### Option 2: Quick Deploy (already committed)

**Pushes existing commits to GitHub and deploys to VM**

```powershell
.\quick-deploy.ps1
```

Use this when you've already committed your changes with `git commit`.

---

## Manual Deployment

If scripts don't work, deploy manually:

**Step 1: Push to GitHub**
```powershell
git add .
git commit -m "Your message"
git push origin master
```

**Step 2: Deploy to VM**
```powershell
ssh samson090281@34.65.169.15 "cd ~/revit-publisher && git pull origin master && pm2 restart revit-publisher && pm2 logs --lines 30"
```

---

## Troubleshooting

### SSH Permission Denied

If you get "Permission denied (publickey)":

1. Check SSH key exists: `Test-Path ~\.ssh\id_ed25519`
2. Verify public key is added to Google Cloud
3. Try using default SSH: The script will automatically fallback if key is not found

### Git Push Failed

Make sure you've committed changes:
```powershell
git status
git add .
git commit -m "Your message"
```

### PM2 Restart Failed

SSH into VM and check status:
```bash
pm2 status
pm2 logs revit-publisher --err
```

---

## What Happens During Deployment

1. ✓ Changes committed to Git (if using deploy-to-vm.ps1)
2. ✓ Code pushed to GitHub
3. ✓ SSH connection to VM
4. ✓ Git pull on VM
5. ✓ PM2 restart server
6. ✓ Display logs (last 30 lines)

---

## VM Details

- **User**: samson090281
- **IP**: 34.65.169.15
- **Project Path**: ~/revit-publisher
- **PM2 App Name**: revit-publisher
- **Port**: 3000
- **URL**: https://rvtpub.digibuild.ch
