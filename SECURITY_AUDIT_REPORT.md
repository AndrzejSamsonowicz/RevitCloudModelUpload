# Security Audit Report
**Date:** March 26, 2026  
**Project:** APS Revit Cloud Model Automation

## Executive Summary
This report identifies critical security vulnerabilities, memory leaks, and code quality issues found in the codebase. **IMMEDIATE ACTION REQUIRED** on critical issues.

---

## 🔴 CRITICAL VULNERABILITIES (Fix Immediately)

### 1. **Missing CORS Protection**
**Severity:** CRITICAL  
**Location:** `server.js`  
**Issue:** No CORS middleware configured. Server accepts requests from any origin.

**Risk:**
- Cross-Site Request Forgery (CSRF) attacks
- Unauthorized API access from malicious websites
- Data theft and session hijacking

**Fix:**
```javascript
// Add after line 59 in server.js
const cors = require('cors');

// Configure CORS with whitelist
const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://your-production-domain.com'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
```

**Action:** Install `cors` package: `npm install cors`

---

### 2. **XSS Vulnerability - Unsafe innerHTML Usage**
**Severity:** CRITICAL  
**Location:** `public/app.js` (979, 982, 983, 997, 1043, 1053, 1065, 1074, 1088, 1099, 1117, 1723, 1735, etc.)  
**Issue:** Direct HTML injection without sanitization

**Risk:**
- Cross-Site Scripting (XSS) attacks
- Session hijacking via stolen tokens
- Malicious script execution in user browsers
- Data exfiltration

**Examples:**
```javascript
// Line 979 - VULNERABLE
element.innerHTML = `<div class="alert ${type}">${message}</div>`;

// Line 1723 - VULNERABLE
thName.innerHTML = `Name${getSortIndicator('name')}`;
```

**Fix:**
```javascript
// Option 1: Use textContent instead of innerHTML
element.textContent = message;

// Option 2: Sanitize HTML input
function sanitizeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Then use:
element.innerHTML = `<div class="alert ${type}">${sanitizeHTML(message)}</div>`;

// Option 3: Use DOMPurify library
// npm install dompurify
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(yourHTML);
```

**Files to Fix:**
- `public/app.js`: Lines 979, 982, 983, 997, 1043, 1053, 1065, 1074, 1088, 1099, 1117, 1169, 1182, 1185, 1194, 1210, 1382, 1580, 1662, 1723, 1735
- `admin.html`: Lines 847, 868, 890, 901, 947, 959, 1006, 1015, 1048, 1056, 1089, 1164, 1630
- `login.html`: Lines 416, 432, 479, 501, 534

---

### 3. **Weak Encryption Configuration**
**Severity:** CRITICAL  
**Location:** `routes/firebaseAuth.js` (Line 30)  
**Issue:** Default encryption key with weak fallback

```javascript
const key = Buffer.from(
    process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32bytes', 
    'utf8'
).slice(0, 32);
```

**Risk:**
- User credentials (APS Client ID/Secret) encrypted with predictable key
- If default key is used, ALL credentials are compromised
- Data breach with plaintext credentials exposure

**Fix:**
```javascript
// Require encryption key - fail fast if not set
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
    throw new Error(
        'ENCRYPTION_KEY must be set in .env file with at least 32 characters. ' +
        'Generate secure key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
}

const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
}
```

**Action:**
1. Generate strong key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Add to `.env`: `ENCRYPTION_KEY=<generated-key>`
3. Remove default fallback
4. **Re-encrypt all existing credentials**

---

### 4. **Session Storage Vulnerability**
**Severity:** CRITICAL  
**Location:** `routes/auth.js` (Line 7)  
**Issue:** In-memory session storage with no expiration

```javascript
const sessions = new Map();
```

**Risk:**
- Sessions never expire
- Memory leak - unbounded growth
- Server restart = all users logged out
- No session revocation capability
- Vulnerable to session fixation attacks

**Fix:**
```javascript
// Use Redis for production
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// Or use express-session with proper configuration
const session = require('express-session');
const RedisStore = require('connect-redis')(session);

app.use(session({
    store: new RedisStore({ client: redis }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
        httpOnly: true, // Prevent XSS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'strict' // CSRF protection
    }
}));
```

**Immediate Workaround (if can't use Redis immediately):**
```javascript
// Add session cleanup and expiration
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

function cleanExpiredSessions() {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.timestamp > SESSION_TIMEOUT) {
            sessions.delete(sessionId);
        }
    }
}

// Run cleanup every hour
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

// Add expiration check in session validation
function isSessionValid(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return false;
    
    if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
        sessions.delete(sessionId);
        return false;
    }
    return true;
}
```

---

### 5. **Insufficient Input Validation**
**Severity:** HIGH  
**Location:** Multiple routes  
**Issue:** Missing or weak input validation

**Examples:**
```javascript
// routes/designAutomation.js - Line 14
const { nickname } = req.body;
if (!nickname) {
    return res.status(400).json({ error: 'Nickname is required' });
}
// No validation of nickname format/length

// routes/firebaseAuth.js - Line 174
if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
}
// Only length check, no complexity requirements
```

**Fix:**
```javascript
// Add comprehensive validation
function validateNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') {
        return { valid: false, error: 'Nickname is required' };
    }
    
    // Trim and check length
    nickname = nickname.trim();
    if (nickname.length < 3 || nickname.length > 64) {
        return { valid: false, error: 'Nickname must be 3-64 characters' };
    }
    
    // Allow only alphanumeric, underscore, hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(nickname)) {
        return { valid: false, error: 'Nickname can only contain letters, numbers, underscore, and hyphen' };
    }
    
    return { valid: true, value: nickname };
}

// Password validation
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }
    
    if (password.length < 12) {
        return { valid: false, error: 'Password must be at least 12 characters' };
    }
    
    // Require complexity
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    if (!(hasUpper && hasLower && hasNumber && hasSpecial)) {
        return { 
            valid: false, 
            error: 'Password must contain uppercase, lowercase, number, and special character' 
        };
    }
    
    return { valid: true };
}
```

---

### 6. **Error Information Disclosure**
**Severity:** HIGH  
**Location:** `server.js` (Line 113)  

```javascript
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: err.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});
```

**Risk:**
- Stack traces leak in development mode if NODE_ENV not set
- Error messages may reveal internal system details
- Helps attackers map system architecture

**Fix:**
```javascript
app.use((err, req, res, next) => {
    // Log full error server-side
    console.error('[Error Handler]', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });
    
    // Send sanitized error to client
    const statusCode = err.statusCode || 500;
    const message = statusCode < 500 ? err.message : 'Internal server error';
    
    res.status(statusCode).json({ 
        error: message,
        // Only include details in local dev environment
        ...(process.env.NODE_ENV === 'development' && req.ip === '127.0.0.1' ? { stack: err.stack } : {})
    });
});
```

---

## 🟡 HIGH PRIORITY ISSUES

### 7. **Memory Leaks**

#### 7.1 Interval Not Cleared on Page Unload
**Location:** `public/app.js`  
**Issue:** Multiple intervals created but not cleaned up

```javascript
// Line 2030
timeSincePublishInterval = setInterval(updateTimeSinceCells, 60000);

// Line 2543
historyRefreshInterval = setInterval(() => {
    refreshPublishingHistory();
}, 5000);
```

**Risk:**
- Memory leak in single-page applications
- Performance degradation over time
- Browser tab consuming excessive memory

**Fix:**
```javascript
// Add cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (timeSincePublishInterval) {
        clearInterval(timeSincePublishInterval);
        timeSincePublishInterval = null;
    }
    
    if (historyRefreshInterval) {
        clearInterval(historyRefreshInterval);
        historyRefreshInterval = null;
    }
});

// Also clear when closing modals
function closePublishingHistory() {
    const modal = document.getElementById('publishingHistoryModal');
    modal.style.display = 'none';
    
    if (historyRefreshInterval) {
        clearInterval(historyRefreshInterval);
        historyRefreshInterval = null;
    }
}
```

#### 7.2 workItemPoller Memory Leak
**Location:** `services/workItemPoller.js`  
**Issue:** WorkItems tracked indefinitely if poller never stops

**Fix:**
```javascript
// Add maximum tracking time
async pollAll() {
    if (this.activeWorkItems.size === 0) {
        this.stop();
        return;
    }

    const now = Date.now();
    const workItemIds = Array.from(this.activeWorkItems.keys());

    for (const workItemId of workItemIds) {
        const info = this.activeWorkItems.get(workItemId);
        const age = now - info.startTime;

        // Stop tracking if too old (already exists)
        if (age > this.maxAge) {
            console.log(`[WorkItemPoller] WorkItem ${workItemId} exceeded max age`);
            await this.updateFirestore(workItemId, info.logId, 'error', 'WorkItem timed out');
            this.activeWorkItems.delete(workItemId);
            continue;
        }
        
        // ... rest of polling logic
    }
    
    // NEW: Stop poller if no items left
    if (this.activeWorkItems.size === 0) {
        console.log('[WorkItemPoller] No active items, stopping poller');
        this.stop();
    }
}
```

#### 7.3 File Cache Never Cleaned
**Location:** `public/app.js` (Line 1282)  

```javascript
const fileCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
```

**Fix:**
```javascript
// Add cache size limit and periodic cleanup
const MAX_CACHE_SIZE = 50; // Maximum number of projects to cache

function setCachedFiles(projectId, files) {
    // Remove oldest entry if cache is full
    if (fileCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = fileCache.keys().next().value;
        fileCache.delete(oldestKey);
    }
    
    fileCache.set(projectId, {
        files: files,
        timestamp: Date.now()
    });
}

// Clean expired cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [projectId, cached] of fileCache.entries()) {
        if (now - cached.timestamp > CACHE_TTL) {
            fileCache.delete(projectId);
        }
    }
}, 5 * 60 * 1000); // Every 5 minutes
```

---

### 8. **Insecure File Upload**
**Location:** `routes/designAutomation.js` (Line 11)  

```javascript
const upload = multer({ dest: 'tmp/' });
```

**Risk:**
- No file type validation
- No file size limit
- Disk space exhaustion
- Uploaded files never cleaned up
- Potential path traversal

**Fix:**
```javascript
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Configure secure upload
const upload = multer({
    dest: 'tmp/',
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Only allow .zip files
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.zip') {
            return cb(new Error('Only .zip files are allowed'));
        }
        
        // Validate MIME type
        if (file.mimetype !== 'application/zip' && 
            file.mimetype !== 'application/x-zip-compressed') {
            return cb(new Error('Invalid file type'));
        }
        
        cb(null, true);
    },
    storage: multer.diskStorage({
        destination: 'tmp/',
        filename: (req, file, cb) => {
            // Generate secure random filename
            const uniqueName = crypto.randomBytes(16).toString('hex') + '.zip';
            cb(null, uniqueName);
        }
    })
});

// Add cleanup job
const fs = require('fs');
const fsPromises = require('fs/promises');

async function cleanupOldUploads() {
    try {
        const files = await fsPromises.readdir('tmp/');
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const file of files) {
            const filePath = path.join('tmp/', file);
            const stats = await fsPromises.stat(filePath);
            
            if (now - stats.mtimeMs > maxAge) {
                await fsPromises.unlink(filePath);
                console.log(`Cleaned up old upload: ${file}`);
            }
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}

// Run cleanup every hour
setInterval(cleanupOldUploads, 60 * 60 * 1000);
```

---

### 9. **Missing Rate Limiting**
**Severity:** HIGH  
**Location:** All routes  
**Issue:** No rate limiting on any endpoints

**Risk:**
- Brute force attacks on authentication
- API abuse and DoS
- Resource exhaustion
- Excessive costs on third-party APIs (APS, Firebase)

**Fix:**
```javascript
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false
});

// Strict limiter for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts, please try again later',
    skipSuccessfulRequests: true
});

// Apply to routes
app.use('/api/', apiLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/oauth/', authLimiter);
```

**Install:** `npm install express-rate-limit`

---

### 10. **Cleartext Credentials in Logs**
**Severity:** HIGH  
**Location:** Multiple files  

**Examples:**
```javascript
// routes/auth.js - credentials logged
console.log('User\'s credentials:', credentials);

// public/app.js - ClientSecret length logged
console.log('[Credentials] ClientSecret length:', data.credentials?.clientSecret?.length || 0);
```

**Risk:**
- Credentials exposed in server logs
- Log aggregation services may store credentials
- Compliance violations (PCI-DSS, GDPR)

**Fix:**
```javascript
// Mask credentials in logs
function maskCredential(credential) {
    if (!credential || credential.length < 8) return '***';
    return credential.substring(0, 4) + '***' + credential.substring(credential.length - 4);
}

// Use masked logging
console.log('User credentials:', {
    clientId: maskCredential(credentials.clientId),
    clientSecret: '***REDACTED***'
});
```

---

## 🟠 MEDIUM PRIORITY ISSUES

### 11. **Missing Security Headers**
**Location:** `server.js`  

**Fix:**
```javascript
const helmet = require('helmet');

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.gstatic.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://developer.api.autodesk.com", "https://firebasestorage.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));
```

**Install:** `npm install helmet`

---

### 12. **Weak Password Policy**
**Location:** `routes/firebaseAuth.js` (Line 174)  

Current: Only 8 characters minimum  
**Recommended:** 12+ characters with complexity requirements (see #5 above)

---

### 13. **No Request Size Limit**
**Location:** `server.js`  

**Fix:**
```javascript
// Line 60-61
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

---

### 14. **Missing HTTPS Enforcement**
**Fix:**
```javascript
// Add before routes in server.js
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            res.redirect(`https://${req.header('host')}${req.url}`);
        } else {
            next();
        }
    });
}
```

---

### 15. **Dependency Vulnerabilities**
**Action Required:** Run security audit

```bash
npm audit
npm audit fix
```

**Recommendations:**
- Update all dependencies to latest versions
- Enable Dependabot/Renovate for automated updates
- Use `npm ci` in production instead of `npm install`

---

## 🔵 BEST PRACTICE IMPROVEMENTS

### 16. **Add Request Logging**
```javascript
const morgan = require('morgan');
app.use(morgan('combined'));
```

### 17. **Environment Variable Validation**
```javascript
// Add at top of server.js
const requiredEnvVars = [
    'APS_CLIENT_ID',
    'APS_CLIENT_SECRET',
    'ENCRYPTION_KEY',
    'SESSION_SECRET',
    'NODE_ENV'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`ERROR: ${envVar} environment variable is not set`);
        process.exit(1);
    }
}
```

### 18. **Add Health Check Endpoint**
```javascript
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
```

---

## IMMEDIATE ACTION PLAN

### Phase 1: Critical Fixes (Do Today)
1. ✅ Add CORS protection
2. ✅ Remove default encryption key fallback
3. ✅ Add XSS sanitization to all innerHTML calls
4. ✅ Add session expiration
5. ✅ Add rate limiting

### Phase 2: High Priority (This Week)
1. ✅ Fix memory leaks (intervals, cache, poller)
2. ✅ Secure file uploads
3. ✅ Add input validation
4. ✅ Sanitize error messages
5. ✅ Remove credential logging

### Phase 3: Medium Priority (Next 2 Weeks)
1. ✅ Add security headers (Helmet)
2. ✅ Implement Redis/proper session storage
3. ✅ Add HTTPS enforcement
4. ✅ Update dependencies
5. ✅ Add comprehensive logging

---

## TESTING CHECKLIST

After implementing fixes:

- [ ] Test XSS prevention with `<script>alert('xss')</script>` in all inputs
- [ ] Verify CORS blocks unauthorized origins
- [ ] Test rate limiting by making rapid requests
- [ ] Verify sessions expire after timeout
- [ ] Check file upload only accepts .zip files under size limit
- [ ] Confirm no credentials appear in logs
- [ ] Test proper error handling without information disclosure
- [ ] Verify memory usage stable over extended time
- [ ] Run `npm audit` and resolve all issues
- [ ] Penetration test with OWASP ZAP or Burp Suite

---

## COMPLIANCE NOTES

**GDPR Compliance:**
- Encryption at rest: ✅ (with strong key)
- Right to erasure: ⚠️ Need data deletion endpoint
- Data minimization: ⚠️ Review what's stored
- Consent management: ❌ Not implemented

**OWASP Top 10 Coverage:**
- A01 Broken Access Control: ⚠️ Partial (needs improvement)
- A02 Cryptographic Failures: ❌ Weak encryption
- A03 Injection: ⚠️ Some XSS risks
- A04 Insecure Design: ⚠️ Session management
- A05 Security Misconfiguration: ❌ Missing headers, CORS
- A06 Vulnerable Components: ⚠️ Need audit
- A07 Authentication Failures: ⚠️ Weak password policy, no MFA
- A08 Software/Data Integrity: ✅ Good
- A09 Logging Failures: ❌ Credentials in logs
- A10 SSRF: ✅ Not applicable

---

## REFERENCES

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [NIST Password Guidelines](https://pages.nist.gov/800-63-3/)

---

**Report End**
