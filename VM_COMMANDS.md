# VM Command Reference

## SSH Connection

```bash
ssh user@34.65.169.15
```

---

## Deploy Security Fix (Already Completed ✅)

```bash
cd ~/revit-publisher
```

```bash
git pull origin master
```

```bash
pm2 restart revit-publisher
```

```bash
pm2 logs --lines 20
```

---

## Fix CORS Issue (IMPORTANT - Run This Now)

### Step 1: Navigate to project directory

```bash
cd ~/revit-publisher
```

---

### Step 2: Open server.js in nano editor

```bash
nano server.js
```

---

### Step 3: Search for "allowedOrigins"

**In nano, press:**

```
Ctrl + W
```

**Then type:**

```
allowedOrigins
```

**Then press Enter**

---

### Step 4: Verify the configuration

You should see this section (around line 127-135):

```javascript
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://rvtpub.digibuild.ch',  // ← This line MUST exist
    'http://rvtpub.digibuild.ch',
    process.env.FRONTEND_URL,
    process.env.PRODUCTION_URL
].filter(Boolean);
```

**✅ If `'https://rvtpub.digibuild.ch',` exists, you're good - skip to Step 6**

**❌ If it's missing, continue to Step 5**

---

### Step 5: Add the missing line (ONLY if needed)

**Use arrow keys to position cursor after `'http://127.0.0.1:3000',`**

**Press Enter to create new line**

**Type:**

```
    'https://rvtpub.digibuild.ch',
```

---

### Step 6: Save and exit nano

**Press:**

```
Ctrl + X
```

**When prompted "Save modified buffer?", press:**

```
Y
```

**When prompted for filename, press:**

```
Enter
```

---

### Step 7: Restart the server

```bash
pm2 restart revit-publisher
```

---

### Step 8: Verify it's working

```bash
pm2 logs --lines 30
```

**Look for the startup messages. Should NOT see CORS errors anymore.**

---

### Step 9: Test in browser

1. Clear browser cache: `Ctrl + Shift + Delete`
2. Visit: `https://rvtpub.digibuild.ch`
3. Test login - should work without "Dangerous site" warning

---

## Useful PM2 Commands

### Check server status
```bash
pm2 status
```

### View live logs
```bash
pm2 logs revit-publisher
```

### View last 50 lines
```bash
pm2 logs --lines 50
```

### Stop server
```bash
pm2 stop revit-publisher
```

### Start server
```bash
pm2 start server.js --name revit-publisher
```

### Restart server
```bash
pm2 restart revit-publisher
```

### View error logs only
```bash
pm2 logs revit-publisher --err
```

---

## Check Server Health

```bash
curl http://localhost:3000
```

```bash
curl https://rvtpub.digibuild.ch
```

---

## View Environment Variables

```bash
cat .env | grep -v PASSWORD | grep -v SECRET | grep -v KEY
```

---

## Git Operations

### Pull latest code
```bash
cd ~/revit-publisher
git pull origin master
```

### Check current branch
```bash
git branch
```

### View recent commits
```bash
git log --oneline -10
```

---

## Troubleshooting

### If site is not responding
```bash
pm2 restart revit-publisher
pm2 logs --lines 50
```

### If port 3000 is blocked
```bash
sudo netstat -tulpn | grep :3000
```

### View nginx logs (if using nginx)
```bash
sudo tail -f /var/log/nginx/error.log
```

### Check disk space
```bash
df -h
```

### Check memory usage
```bash
free -h
```

---

## Quick Deployment Script (One Command)

Deploy latest code and restart:

```bash
cd ~/revit-publisher && git pull origin master && pm2 restart revit-publisher && pm2 logs --lines 20
```

---

## Emergency: Revert to Previous Version

```bash
cd ~/revit-publisher
git log --oneline -5
git checkout <commit-hash>
pm2 restart revit-publisher
```

---

## Next Steps After CORS Fix

1. Clear your browser cache (Ctrl+Shift+Delete)
2. Visit: https://rvtpub.digibuild.ch
3. Test login with Autodesk
4. Verify NO "Dangerous site" warning appears
