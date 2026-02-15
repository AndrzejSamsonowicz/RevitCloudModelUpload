# Firebase Authentication Setup Guide

This guide will help you configure Firebase authentication for the Revit Cloud Model Publisher multi-tenant application.

## Overview

The application now supports:
- **User Registration & Login** with email/password
- **Email Verification** for new accounts
- **Password Reset** functionality
- **License Management** with PayPal integration
- **Encrypted Credential Storage** for each user's APS credentials
- **Admin Dashboard** for user and license management

## Prerequisites

1. Google account (for Firebase)
2. PayPal developer account (for license purchases)
3. Node.js installed on your system

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Enter project name: `revit-cloud-publisher` (or your preferred name)
4. Disable Google Analytics (optional)
5. Click "Create project"

## Step 2: Enable Firebase Authentication

1. In your Firebase project, go to **Build** > **Authentication**
2. Click "Get started"
3. Click on "Sign-in method" tab
4. Enable **Email/Password** provider:
   - Click on "Email/Password"
   - Toggle "Enable"
   - Click "Save"

## Step 3: Create Firestore Database

1. Go to **Build** > **Firestore Database**
2. Click "Create database"
3. Choose **Production mode** (we'll configure rules next)
4. Select a location closest to your users
5. Click "Enable"

### Configure Firestore Security Rules

1. Go to **Firestore Database** > **Rules**
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Licenses collection - users can only read their own license
    match /licenses/{licenseKey} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if false; // Only admin can write
    }
    
    // Analytics collection - no direct access
    match /analytics/{document} {
      allow read, write: if false;
    }
    
    // Admin routes accessible only via backend
  }
}
```

3. Click "Publish"

## Step 4: Get Firebase Client Credentials

### For Web App (Client-side)

1. In Firebase Console, go to **Project settings** (gear icon)
2. Scroll to "Your apps" section
3. Click the **Web** icon (</>)
4. Register app:
   - App nickname: `Revit Cloud Publisher Web`
   - Don't check "Firebase Hosting" (we'll use our own server)
   - Click "Register app"
5. Copy the `firebaseConfig` object
6. Open `public/firebase-config.js` in your project
7. Replace the placeholder values with your actual Firebase config:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456",
    measurementId: "G-XXXXXXXXXX" // Optional
};
```

### For Server (Firebase Admin SDK)

1. In Firebase Console, go to **Project settings** > **Service accounts**
2. Click "Generate new private key"
3. Click "Generate key" (this downloads a JSON file)
4. Save this file as `firebase-service-account.json` in your project root
5. **IMPORTANT**: Add this file to `.gitignore`:

```bash
# .gitignore
firebase-service-account.json
.env
```

## Step 5: Configure Environment Variables

1. Copy `.env.template` to `.env` (if it doesn't exist):

```bash
cp .env.template .env
```

2. Edit `.env` and configure:

```bash
# Autodesk Platform Services
APS_CLIENT_ID=your_aps_client_id
APS_CLIENT_SECRET=your_aps_client_secret
APS_CALLBACK_URL=http://localhost:3000/oauth/callback

# Server
PORT=3000
NODE_ENV=development

# Firebase Admin SDK - Option 1: Use service account file
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# Firebase Admin SDK - Option 2: Use environment variables (alternative)
# FIREBASE_PROJECT_ID=your-project-id
# FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com

# PayPal Configuration
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
PAYPAL_MODE=sandbox  # Change to 'live' for production

# Admin Configuration
ADMIN_EMAIL=your_admin_email@example.com

# Session Secret
SESSION_SECRET=generate_a_random_secret_key_here
```

## Step 6: Setup PayPal for License Purchases

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/)
2. Log in with your PayPal account
3. Go to **Apps & Credentials**
4. Create a new app:
   - Click "Create App"
   - App Name: `Revit Cloud Publisher`
   - App Type: **Merchant**
   - Click "Create App"
5. Copy your credentials:
   - **Client ID** → `PAYPAL_CLIENT_ID` in `.env`
   - **Secret** → `PAYPAL_CLIENT_SECRET` in `.env`
6. For testing, use **Sandbox** mode (`PAYPAL_MODE=sandbox`)
7. For production, switch to **Live** credentials and set `PAYPAL_MODE=live`

## Step 7: Install Dependencies

```bash
npm install
```

This will install:
- `firebase-admin` - Server-side Firebase SDK
- `@paypal/checkout-server-sdk` - PayPal integration
- All existing dependencies

## Step 8: Create Admin User

After the first user registers, you need to manually set them as admin:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Go to **Firestore Database**
3. Find the `users` collection
4. Find your user document (by email)
5. Click "Edit"
6. Add a new field:
   - Field: `isAdmin`
   - Type: `boolean`
   - Value: `true`
7. Click "Update"

Now this user can access the admin dashboard at `/admin`.

## Step 9: Start the Server

```bash
npm start
```

The server will log:
```
✓ Server running on http://localhost:3000
✓ Environment: development
✓ APS Client ID: ***XXXX
✓ Firebase: Connected
```

## Step 10: Test the Application

### User Flow:

1. **Register**: Visit `http://localhost:3000/register`
   - Enter email, password
   - Optionally enter license key (or purchase later)
   - Click "Create Account"
   - Check email for verification link

2. **Verify Email**: Click the link in the verification email

3. **Login**: Visit `http://localhost:3000/login`
   - Enter email and password
   - Click "Log In"

4. **Purchase License** (if needed): Visit `http://localhost:3000/purchase`
   - Enter email
   - Click PayPal button
   - Complete payment
   - License key sent to email

5. **Access Dashboard**: Automatic redirect to `/dashboard`
   - View license status
   - Configure APS credentials (encrypted and stored per user)
   - Publish Revit models

### Admin Flow:

1. **Login as Admin**: Use the admin account you created
2. **Access Admin Panel**: Visit `http://localhost:3000/admin`
3. **Manage Users**: View all users, activate/deactivate licenses
4. **Manage Licenses**: Manually activate licenses for users
5. **View Analytics**: See payment and usage data

## Security Features

### Client-Side Authentication (Firebase Auth)
- Email/password authentication
- Email verification required
- Password reset via email
- Session management with Firebase tokens

### Server-Side Authentication (Firebase Admin SDK)
- Token verification on API requests
- Secure user data access
- License validation before allowing access

### Encrypted Credential Storage
Each user's APS credentials are:
1. Encrypted in the browser using AES-256
2. Stored in Firestore (encrypted)
3. Decrypted only when needed
4. Never exposed to other users
5. Never logged or transmitted unencrypted

### Multi-Tenant Isolation
- Each user has their own credential set
- Users cannot access other users' data
- Firestore rules enforce data isolation
- Admin SDK validates all backend operations

## Troubleshooting

### "Firebase credentials not configured"
- Ensure `firebase-service-account.json` exists in project root
- Or set individual environment variables (`FIREBASE_PRIVATE_KEY`, etc.)
- Check file path in `.env`

### "AUTH-001" Error on Login
- Verify `firebaseConfig` in `public/firebase-config.js`
- Check email verification is enabled in Firebase Console
- Ensure user verified their email

### "License Required" Error
- User needs active license
- Admin can manually activate license in admin panel
- Or user can purchase license at `/purchase`

### PayPal Integration Issues
- Verify PayPal credentials in `.env`
- Check `PAYPAL_MODE` is set correctly (sandbox/live)
- Ensure PayPal app is approved for production (if using live mode)

### Cannot Access Admin Panel
- Ensure `isAdmin: true` is set in Firestore for your user
- Check console for authentication errors
- Verify you're logged in as the correct user

## Production Deployment

### Security Checklist:

1. **Environment Variables**:
   - Never commit `.env` or `firebase-service-account.json`
   - Use secure environment variable storage (e.g., Google Cloud Secret Manager)

2. **Firestore Rules**:
   - Review and test security rules
   - Never use `allow read, write: if true` in production

3. **HTTPS**:
   - Use SSL certificate (Let's Encrypt)
   - Update all callback URLs to `https://`

4. **Firebase Auth**:
   - Configure authorized domains in Firebase Console
   - Add your production domain to authorized domains

5. **PayPal**:
   - Switch to live credentials
   - Set `PAYPAL_MODE=live`
   - Update webhook URLs

6. **API Keys**:
   - Restrict Firebase API keys by domain/IP
   - Use Firebase App Check for additional security

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [PayPal Developer Docs](https://developer.paypal.com/docs/api/overview/)

## Support

For issues or questions:
1. Check Firebase Console for errors
2. Review server logs (`npm start`)
3. Check browser console for client-side errors
4. Verify all environment variables are set correctly
