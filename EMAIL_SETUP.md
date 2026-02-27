# Email Service Setup Guide

This guide explains how to configure email sending for verification emails and password resets.

## Quick Start (Gmail - Recommended for Development)

### 1. Enable 2-Step Verification
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**

### 2. Generate App Password
1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select app: **Mail**
3. Select device: **Other (Custom name)** → Type "Revit Publisher"
4. Click **Generate**
5. Copy the 16-character password (remove spaces)

### 3. Update .env File
```env
# Add these lines to your .env file
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-char-app-password
APP_URL=http://localhost:3000
```

### 4. Restart Server
```bash
# Stop and restart the Node.js server
npm start
```

## Alternative Options

### Option 2: SendGrid (Production Recommended)

1. Sign up at [SendGrid](https://sendgrid.com/)
2. Create an API key
3. Add to .env:
```env
SENDGRID_API_KEY=your-api-key
APP_URL=https://your-domain.com
EMAIL_FROM=noreply@your-domain.com
```

### Option 3: Custom SMTP Server

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASS=your-password
APP_URL=https://your-domain.com
EMAIL_FROM=noreply@your-domain.com
```

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `APP_URL` | **Required** - Your application URL | `http://localhost:3000` |
| `GMAIL_USER` | Gmail email address | `yourapp@gmail.com` |
| `GMAIL_APP_PASSWORD` | Gmail app-specific password | `abcd efgh ijkl mnop` |
| `SENDGRID_API_KEY` | SendGrid API key | `SG.xxxxxxx` |
| `EMAIL_FROM` | Optional - Override from address | `noreply@company.com` |

## Testing Email Functionality

### Without Email Configuration (Dev Mode)
If no email service is configured, emails will be logged to the console:

```
📧 ===== EMAIL (DEV MODE) =====
To: user@example.com
Subject: Verify Your Email
--- HTML Content ---
[email HTML here]
===========================
```

You can copy the verification/reset links from the console.

### With Email Configuration
1. Register a new user
2. Check email inbox for verification link
3. Test "Forgot Password" flow
4. Check console for any errors

## Features

### Email Verification
- **Custom system** - No expiration (unlike Firebase's 3-day limit)
- Sent on registration
- Can be resent from login page
- Tokens stored in Firestore

### Password Reset
- **Custom system** - 1-hour expiration for security
- Requested from "Forgot Password" link on login page
- Reset tokens stored in Firestore
- Maintains backwards compatibility with Firebase native links

## Troubleshooting

### Email Not Sending

Check server console for errors:
```
⚠️  No email service configured. Emails will be logged to console only.
```

**Solution**: Configure GMAIL_USER/GMAIL_APP_PASSWORD or other email service in .env

### Gmail "Less Secure Apps" Error

Gmail no longer supports "less secure apps". You **must** use an App Password (see Quick Start above).

### SendGrid Authentication Failed

1. Verify API key is correct
2. Check SendGrid dashboard for account status
3. Ensure sender email is verified in SendGrid

### SMTP Connection Timeout

1. Check SMTP_HOST and SMTP_PORT are correct
2. Verify firewall allows outbound connections on SMTP port
3. Try SMTP_SECURE=true for port 465

### Email Received but Links Don't Work

Check `APP_URL` in .env matches your actual application URL:
- Development: `http://localhost:3000`
- Production: `https://your-domain.com`

## Production Recommendations

1. **Use SendGrid or Professional SMTP**: More reliable than Gmail
2. **Set proper APP_URL**: Use your actual domain
3. **Configure SPF/DKIM**: Improve email deliverability
4. **Monitor email logs**: Track delivery success/failures
5. **Set rate limits**: Prevent abuse of email sending

## Security Notes

- **Never commit .env file** to version control
- App passwords are less privileged than account passwords
- Reset tokens expire after 1 hour
- Verification tokens never expire (can only be used once)
- Passwords must be at least 8 characters

## Email Templates

Email templates are defined in `services/emailService.js`:
- Verification email template (blue theme)
- Password reset email template (red theme)

Customize these templates as needed for your branding.
