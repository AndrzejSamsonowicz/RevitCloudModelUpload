# Quick Start - Security Fixes

## 🚀 5-Minute Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Encryption Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (64 hex characters).

### 3. Update .env File
Add/update these lines in `.env`:

```env
# Required - paste the key from step 2
ENCRYPTION_KEY=<paste-64-character-key-here>

# Required
NODE_ENV=development

# Optional (for production)
FRONTEND_URL=https://your-domain.com
PRODUCTION_URL=https://your-domain.com
```

### 4. Test Server Starts
```bash
npm start
```

You should see:
```
✓ Firebase Admin SDK initialized
✓ WorkItem Poller initialized
✓ Session cleanup scheduler initialized
✓ Upload cleanup scheduler initialized
✓ Server running on http://localhost:3000
✓ Environment: development
```

### 5. Add Sanitization Script to HTML Files

**Files to edit:**
- public/index.html
- public/dashboard.html  
- public/register.html
- public/reset-password.html
- login.html
- admin.html
- purchase.html

**Add this line** BEFORE the closing `</body>` tag or before app.js script:
```html
<script src="/sanitize.js"></script>
<script src="/app.js"></script>
```

---

## ⚠️ IMPORTANT: User Credentials

After changing ENCRYPTION_KEY, **all users must re-enter their APS credentials**!

The old encrypted credentials cannot be decrypted with the new key.

---

## ✅ What's Already Fixed

Backend security is 100% complete:
- ✅ CORS protection
- ✅ Rate limiting
- ✅ Helmet security headers
- ✅ Session expiration (24hr)
- ✅ Strong password requirements (12+ chars)
- ✅ Secure file uploads
- ✅ Input validation
- ✅ Error sanitization
- ✅ Memory leak fixes (backend)

---

## ⚠️ What Still Needs Work

### Required Before Production:

1. **Fix XSS in app.js** (~2-3 hours)
   - Replace unsafe `innerHTML` calls
   - Use `sanitizeHTML()` function
   - See IMPLEMENTATION_GUIDE.md for examples

2. **Fix Memory Leaks in app.js** (~30 min)
   - Add interval cleanup on page unload
   - Add cache size limit
   - See IMPLEMENTATION_GUIDE.md for code

3. **Test Everything** (~1 hour)
   - Test rate limiting
   - Test file upload restrictions
   - Test password requirements
   - Test XSS prevention

---

## 🧪 Quick Tests

### Test 1: Server Security
```bash
# Should fail - missing encryption key
# (temporarily remove ENCRYPTION_KEY from .env)
npm start
# Should see: ERROR: ENCRYPTION_KEY must be at least 64 characters
```

### Test 2: Rate Limiting
```bash
# Make 6 rapid requests (should block 6th)
for i in {1..6}; do curl -X POST http://localhost:3000/oauth/login; done
```

### Test 3: Password Strength
Try registering with weak password:
- `abc123` → Should be rejected (too short)
- `abcdefghijk` → Should be rejected (no uppercase/number/special)
- `Abc123!@#def` → Should succeed ✅

### Test 4: File Upload
Try uploading non-zip file → Should be rejected

---

## 📖 Full Documentation

- **SECURITY_AUDIT_REPORT.md** - Complete vulnerability analysis
- **IMPLEMENTATION_GUIDE.md** - Detailed implementation steps
- **FIXES_SUMMARY.md** - Summary of what was fixed

---

## 🆘 Troubleshooting

### Server won't start
- Check .env has all required variables
- Verify ENCRYPTION_KEY is exactly 64 hex characters
- Check Firebase credentials are valid

### "ENCRYPTION_KEY must be at least 64 characters"
- Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Copy full output (64 characters) to .env

### Users can't log in after update
- Normal! Encryption key changed
- Users must re-enter APS credentials in Settings

### Rate limit too strict
- Edit server.js, find `apiLimiter` and `authLimiter`
- Increase `max` value (currently 100 for API, 5 for auth)

---

## Next Steps

1. ✅ Complete 5-minute setup above
2. ⚠️ Implement frontend XSS fixes (see IMPLEMENTATION_GUIDE.md)
3. ⚠️ Implement memory leak fixes (see IMPLEMENTATION_GUIDE.md)
4. ✅ Run all tests
5. ✅ Deploy to production

---

*Total time: 5 min setup + 4 hours implementation = ~4 hours total*
