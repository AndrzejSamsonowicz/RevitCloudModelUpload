# Critical Security Fix: OAuth Token Exposure

## Issue
Chrome flagged the site as "Dangerous" because Firebase authentication tokens were being exposed in the URL during OAuth login flow.

### Vulnerability Details
**Date Discovered:** March 27, 2026  
**Severity:** CRITICAL  
**Type:** Sensitive Data Exposure (CWE-598)

The application was passing Firebase ID tokens as URL parameters:
```
https://rvtpub.digibuild.ch/oauth/login?firebaseToken=eyJhbGciOiJSUzI1...
```

This exposed sensitive authentication tokens in:
- ✗ Browser URL bar
- ✗ Browser history
- ✗ Web server access logs
- ✗ Network monitoring tools
- ✗ Referrer headers to external sites
- ✗ Chrome history sync to Google servers

## Root Cause
The OAuth login flow used an insecure GET request pattern:

**Before (INSECURE):**
```javascript
// public/app.js - Line 488
window.location.href = `/oauth/login?firebaseToken=${token}`;

// routes/auth.js - Line 54
router.get('/login', async (req, res) => {
    const { firebaseToken } = req.query; // Token from URL!
    ...
});
```

## Solution Implemented
Changed OAuth login to use secure POST request with token in request body:

**After (SECURE):**
```javascript
// public/app.js
const response = await fetch('/oauth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firebaseToken: token })
});

if (response.ok) {
    const data = await response.json();
    if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
    }
}

// routes/auth.js
router.post('/login', async (req, res) => {
    const { firebaseToken } = req.body; // Token in request body
    ...
    res.json({ redirectUrl: authUrl }); // Return URL as JSON
});
```

## Security Improvements
1. ✓ Token no longer visible in URL
2. ✓ Token no longer logged in server access logs
3. ✓ Token no longer saved in browser history
4. ✓ Token no longer visible to network observers
5. ✓ HTTPS encryption protects token in transit
6. ✓ Follows OAuth 2.0 security best practices

## Testing
After deploying this fix:
1. Clear browser cache and history
2. Test the OAuth login flow
3. Verify Chrome no longer shows "Dangerous site" warning
4. Check that Autodesk authentication still works correctly

## Additional Security Measures
The server already includes:
- Helmet.js with CSP headers
- HSTS enabled (forces HTTPS)
- CORS protection
- Rate limiting
- Input validation

## References
- OWASP: Sensitive Data Exposure
- RFC 6749: OAuth 2.0 Security Considerations
- CWE-598: Use of GET Request Method With Sensitive Query Strings
