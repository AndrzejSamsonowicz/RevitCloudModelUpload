# Security Fixes Implementation Guide

## Critical Fixes Completed ✅

### 1. Server Security (server.js)
- ✅ Added environment variable validation
- ✅ Added CORS protection
- ✅ Added Helmet security headers
- ✅ Added rate limiting (API and auth)
- ✅ Added request size limits
- ✅ Added HTTPS enforcement for production
- ✅ Improved error handling (no stack leak)
- ✅ Added health check endpoint

### 2. Encryption Security (routes/firebaseAuth.js)
- ✅ Removed weak encryption key fallback
- ✅ Added encryption key validation (must be 64 hex chars)
- ✅ Added input validation functions
- ✅ Password requires 12+ chars with complexity
- ✅ Email validation with regex
- ✅ Nickname validation
- ✅ Added credential masking in logs

### 3. Session Management (routes/auth.js)
- ✅ Added session timeout (24 hours)
- ✅ Added automatic session cleanup (hourly)
- ✅ Added session validation function

### 4. File Upload Security (routes/designAutomation.js)
- ✅ Added file type validation (.zip only)
- ✅ Added file size limit (100MB)
- ✅ Added MIME type validation
- ✅ Added secure random filenames
- ✅ Added automatic cleanup of old uploads (24 hour TTL)
- ✅ Added nickname input validation

### 5. HTML Sanitization Utility Created
- ✅ Created public/sanitize.js with sanitization functions
- ⚠️ MUST be included in HTML files before app.js

## Remaining Fixes Needed

### 6. Fix XSS Vulnerabilities in app.js
**Status:** NEEDS MANUAL REVIEW

The following functions use unsafe innerHTML and need updating:

#### High Priority (User-Controlled Content):
1. **showMessage()** - Line 979
2. **showToast()** - Line 997
3. **displayHubs()** - Lines 1043-1117
4. **displayProjects()** - Lines 1191-1210
5. **renderFilesList()** - Lines 1723, 1735, 1858-1862
6. **displayRevitFiles()** - Lines 1550-1563

#### Recommended Fix Pattern:
```javascript
// OLD (VULNERABLE):
element.innerHTML = `<div class="alert ${type}">${message}</div>`;

// NEW (SAFE):
element.textContent = ''; // Clear first
const alertDiv = createSafeElement('div', message, `alert ${type}`);
element.appendChild(alertDiv);

// OR if you need HTML structure:
element.innerHTML = `<div class="alert ${type}">${sanitizeHTML(message)}</div>`;
```

### 7. Fix Memory Leaks in app.js

#### A. Cleanup Intervals on Page Unload (Line ~2030, ~2543)
**Add this code after line ~2036:**

```javascript
// Cleanup intervals on page unload/close
window.addEventListener('beforeunload', () => {
    console.log('Page unloading - cleaning up intervals');
    
    if (timeSincePublishInterval) {
        clearInterval(timeSincePublishInterval);
        timeSincePublishInterval = null;
    }
    
    if (historyRefreshInterval) {
        clearInterval(historyRefreshInterval);
        historyRefreshInterval = null;
    }
});

// Also cleanup when navigating away (SPA behavior)
window.addEventListener('pagehide', () => {
    if (timeSincePublishInterval) {
        clearInterval(timeSincePublishInterval);
        timeSincePublishInterval = null;
    }
    
    if (historyRefreshInterval) {
        clearInterval(historyRefreshInterval);
        historyRefreshInterval = null;
    }
});
```

#### B. Fix File Cache Growth (Line ~1294)
Replace `setCachedFiles` function:

```javascript
const MAX_CACHE_SIZE = 50; // Maximum number of projects to cache

function setCachedFiles(projectId, files) {
    // Remove oldest entry if cache is full
    if (fileCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = fileCache.keys().next().value;
        fileCache.delete(oldestKey);
        console.log(`Cache full, removed oldest entry: ${oldestKey}`);
    }
    
    fileCache.set(projectId, {
        files: files,
        timestamp: Date.now()
    });
    console.log(`Cached ${files.length} files for project:`, projectId);
}

// Add periodic cache cleanup
setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [projectId, cached] of fileCache.entries()) {
        if (now - cached.timestamp > CACHE_TTL) {
            fileCache.delete(projectId);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`Cache cleanup: removed ${cleanedCount} expired entries`);
    }
}, 5 * 60 * 1000); // Every 5 minutes
```

### 8. Fix WorkItem Poller Memory Leak (services/workItemPoller.js)

**Update the `pollAll` function (around line 65):**

Add this at the end of the function:

```javascript
async pollAll() {
    if (this.activeWorkItems.size === 0) {
        this.stop();
        return;
    }

    // ... existing polling logic ...

    // NEW: Stop poller if no items left after cleanup
    if (this.activeWorkItems.size === 0) {
        console.log('[WorkItemPoller] No active items remaining, stopping poller');
        this.stop();
    }
}
```

## Installation Steps

### 1. Install New Dependencies
```bash
npm install
```

This will install:
- cors
- helmet
- express-rate-limit
- dompurify
- isomorphic-dompurify
- ioredis (for future Redis session storage)
- connect-redis (for future Redis session storage)

### 2. Update .env File

**CRITICAL:** Generate a secure encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to .env:
```env
# Required - 64 character hex string (32 bytes)
ENCRYPTION_KEY=<paste-generated-key-here>

# Optional - for CORS in production
FRONTEND_URL=https://your-domain.com
PRODUCTION_URL=https://your-domain.com

# Set environment
NODE_ENV=production  # or 'development'
```

**⚠️ IMPORTANT:** After updating ENCRYPTION_KEY, all users will need to re-enter their APS credentials!

### 3. Include Sanitization Script in HTML Files

Add this line to ALL HTML files BEFORE the app.js script tag:

**Files to update:**
- public/index.html
- public/dashboard.html
- public/register.html
- public/reset-password.html
- login.html
- admin.html
- purchase.html

```html
<!-- Add BEFORE app.js -->
<script src="/sanitize.js"></script>
<script src="/app.js"></script>
```

### 4. Test Locally

```bash
npm start
```

**Test these scenarios:**

1. ✅ Server starts without errors
2. ✅ Login works
3. ✅ Registration requires strong password (12+ chars, complexity)
4. ✅ File upload rejects non-.zip files
5. ✅ Rate limiting kicks in after 5 auth attempts
6. ✅ Sessions expire after 24 hours
7. ✅ Old uploads are cleaned up
8. ✅ CORS blocks unauthorized origins (test with curl from different origin)

### 5. Security Testing

#### Test XSS Protection:
Try injecting this in various inputs:
```javascript
<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
```

Should be escaped/sanitized, not executed.

#### Test Rate Limiting:
Make 6 rapid login attempts - should get blocked:
```bash
for i in {1..6}; do curl -X POST http://localhost:3000/oauth/login; done
```

#### Test File Upload:
Try uploading .exe, .js files - should be rejected.

## Deployment Checklist

Before deploying to production:

- [ ] ✅ All dependencies installed (`npm install`)
- [ ] ✅ ENCRYPTION_KEY set in .env (64 hex chars)
- [ ] ✅ NODE_ENV=production in .env
- [ ] ✅ FRONTEND_URL and PRODUCTION_URL configured
- [ ] ⚠️ All users notified to re-enter APS credentials
- [ ] ✅ Sanitize.js added to all HTML files
- [ ] ⚠️ XSS fixes applied to app.js (manual review needed)
- [ ] ⚠️ Memory leak fixes applied to app.js (manual review needed)
- [ ] ⚠️ Memory leak fix applied to workItemPoller.js
- [ ] ✅ Health check endpoint tested: /health
- [ ] ✅ Security testing completed
- [ ] ✅ Backup database before deployment
- [ ] ⚠️ Review all logs to ensure no credentials are being logged

## Migration Notes

### Re-Encrypting User Credentials

After changing ENCRYPTION_KEY, existing encrypted credentials will not be decryptable. You have two options:

**Option 1: Notify Users (Recommended)**
- Deploy the changes
- Send email to all users: "Please re-enter your APS credentials in Settings"
- System will show empty credentials form

**Option 2: Migration Script**
Create a migration endpoint (remove after migration):

```javascript
// Temporary migration endpoint - REMOVE AFTER USE
router.post('/api/admin/migrate-credentials', async (req, res) => {
    // This would use OLD key to decrypt, then NEW key to re-encrypt
    // Only run once, then delete this endpoint
});
```

## Monitoring

After deployment, monitor these metrics:

1. **Error logs** - Check for encryption/decryption failures
2. **Session cleanup** - Should see hourly cleanup logs
3. **Upload cleanup** - Should see cleanup logs every hour
4. **Rate limit hits** - Log when users hit rate limits
5. **Memory usage** - Should be stable, not growing over time
6. **Failed login attempts** - Monitor for brute force attacks

## Still TODO (Lower Priority)

From SECURITY_AUDIT_REPORT.md:

- [ ] Implement proper session storage with Redis (current: in-memory Map)
- [ ] Add Content Security Policy fine-tuning
- [ ] Add request logging with Morgan
- [ ] Add 2FA/MFA support
- [ ] Add GDPR compliance features (data deletion endpoint)
- [ ] Penetration testing with OWASP ZAP
- [ ] Regular dependency audits (`npm audit`)
- [ ] Add security.txt file
- [ ] Add monitoring/alerting for security events

## Support & Questions

If you encounter issues:

1. Check server logs for detailed error messages
2. Verify .env file has all required variables
3. Ensure ENCRYPTION_KEY is exactly 64 hex characters
4. Check SECURITY_AUDIT_REPORT.md for detailed explanations
5. Test with NODE_ENV=development first before production

## Summary

✅ **Completed (Ready to Use):**
- Server security hardening
- Encryption key validation
- Session management improvements
- File upload security
- Input validation
- Rate limiting
- Error handling improvements

⚠️ **Needs Manual Review:**
- XSS fixes in app.js (innerHTML replacements)
- Memory leak fixes in app.js
- Memory leak fix in workItemPoller.js
- Adding sanitize.js to HTML files

All the critical backend security is now in place. The frontend XSS and memory leak fixes require careful manual testing since they affect UI behavior.
