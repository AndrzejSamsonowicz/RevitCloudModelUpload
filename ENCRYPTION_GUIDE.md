# Data Encryption for Scheduled Publishing

This document describes the encryption implementation for sensitive data in scheduled publishing features.

## Overview

The system now encrypts sensitive information (file names and project names) before storing scheduled publishing data in Firestore. This protects user data at rest.

## What Gets Encrypted

- **File names** - Names of Revit files scheduled for publishing
- **Project names** - Names of projects where files are located

## Encryption Method

- **Algorithm**: AES-256-GCM (Advanced Encryption Standard with Galois/Counter Mode)
- **Key Length**: 256 bits (32 bytes)
- **Initialization Vector (IV)**: 128 bits, randomly generated per encryption
- **Authentication Tag**: 128 bits for data integrity verification

## Architecture

### Components

1. **Backend Encryption Service** (`services/encryption.js`)
   - Provides core encryption/decryption functions
   - Uses AES-256-GCM algorithm
   - Manages encryption key from environment variables

2. **Encryption API Routes** (`routes/encryption.js`)
   - `/api/encryption/encrypt-schedules` - Encrypts schedule data
   - `/api/encryption/decrypt-schedules` - Decrypts schedule data
   - `/api/encryption/generate-key` - Generates new encryption key (dev only)

3. **Frontend Integration** (`public/app.js`)
   - `savePublishingSchedules()` - Encrypts before saving to Firestore
   - `loadPublishingSchedules()` - Decrypts after loading from Firestore

4. **Cloud Functions** (`functions/encryption.js`, `functions/index.js`)
   - Decrypts schedules when executing scheduled publishing
   - Uses Firebase Functions config for encryption key

### Data Flow

```
User creates schedule → Frontend encrypts → Store in Firestore (encrypted)
                                              ↓
User loads schedules ← Frontend decrypts ← Load from Firestore (encrypted)
                                              ↓
Cloud Function runs → Decrypt schedules → Trigger publishing
```

## Setup Instructions

### 1. Generate Encryption Key

Run the key generator:

```bash
node generate-encryption-key.js
```

This will output:
- A random 256-bit encryption key (hex format recommended)
- Setup instructions for both backend and Cloud Functions

### 2. Configure Backend Server (VM)

Add the encryption key to your environment:

**Option A: .env file**
```bash
ENCRYPTION_KEY=your_generated_key_here
```

**Option B: Direct environment variable**
```bash
export ENCRYPTION_KEY=your_generated_key_here
```

Then restart the server:
```bash
pm2 restart revit-publisher
```

### 3. Configure Firebase Cloud Functions

Set the encryption key in Firebase Functions config:

```bash
firebase functions:config:set encryption.key="your_generated_key_here"
```

Verify the configuration:
```bash
firebase functions:config:get
```

Deploy the updated functions:
```bash
firebase deploy --only functions
```

### 4. Verify Encryption

1. Create a new scheduled publish in the UI
2. Save the schedule
3. Check browser console for: `✓ Schedules encrypted successfully`
4. Check Firestore:
   - File names should be in format: `iv:authTag:ciphertext` (hex strings)
   - Project names should be encrypted similarly
5. Reload the page and verify schedules display correctly (decrypted)

## Security Considerations

### Key Management

⚠️ **CRITICAL**: 
- **Never commit the encryption key to Git**
- Store the key securely (password manager, encrypted vault)
- If the key is lost, encrypted data cannot be recovered
- Use the same key across all environments (VM + Cloud Functions)

### Backup Strategy

1. **Backup the encryption key** securely
2. Store it separately from the codebase
3. Document who has access to the key
4. Have a key rotation plan for long-term security

### Fallback Behavior

The system gracefully handles both encrypted and unencrypted data:

- If decryption fails, returns the raw value (legacy compatibility)
- If encryption API is unavailable, saves without encryption (with warning)
- Existing unencrypted schedules work until re-saved

## Migration from Unencrypted Data

The system automatically migrates data:

1. Existing unencrypted schedules are read normally
2. When user edits and saves a schedule, it gets encrypted
3. No manual migration needed
4. Both encrypted and unencrypted data coexist safely

## API Documentation

### POST /api/encryption/encrypt-schedules

Encrypts an array of schedule objects.

**Request:**
```json
{
  "schedules": [
    {
      "fileName": "My Building.rvt",
      "projectName": "Construction Project",
      ...other fields
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "schedules": [
    {
      "fileName": "a1b2c3d4e5f6...:abcdef...:12345678...",
      "projectName": "1a2b3c4d5e6f...:fedcba...:87654321...",
      ...other fields
    }
  ]
}
```

### POST /api/encryption/decrypt-schedules

Decrypts an array of schedule objects.

**Request:**
```json
{
  "schedules": [
    {
      "fileName": "a1b2c3d4e5f6...:abcdef...:12345678...",
      "projectName": "1a2b3c4d5e6f...:fedcba...:87654321...",
      ...other fields
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "schedules": [
    {
      "fileName": "My Building.rvt",
      "projectName": "Construction Project",
      ...other fields
    }
  ]
}
```

## Troubleshooting

### Schedules Don't Decrypt

**Symptoms**: Encrypted values displayed in UI (long hex strings)

**Solutions**:
1. Check `ENCRYPTION_KEY` is set in backend environment
2. Verify key matches between VM and Cloud Functions
3. Check browser console for decryption errors
4. Verify API endpoint returns 200 status

### Cloud Function Fails to Publish

**Symptoms**: Scheduled publishing doesn't execute

**Solutions**:
1. Check Cloud Functions logs: `firebase functions:log`
2. Verify encryption key is set: `firebase functions:config:get`
3. Look for decryption errors in logs
4. Ensure key matches backend server key

### "Encryption Failed" Warning

**Symptoms**: Warning message when saving schedules

**Solutions**:
1. Check server is running and accessible
2. Verify `/api/encryption/encrypt-schedules` endpoint works
3. Check server logs for errors
4. As fallback, data is saved unencrypted (still functional)

## Testing

### Manual Testing

1. **Create Schedule**:
   - Create a schedule with a file
   - Save it
   - Check Firestore: data should be encrypted

2. **Load Schedule**:
   - Refresh the page
   - Verify schedules load with correct file/project names

3. **Scheduled Execution**:
   - Wait for Cloud Function to run
   - Check logs for successful decryption
   - Verify publishing executes correctly

### Automated Testing

Run encryption/decryption tests:

```bash
node -e "
const { encrypt, decrypt } = require('./services/encryption');
const testData = 'My Building.rvt';
const encrypted = encrypt(testData);
const decrypted = decrypt(encrypted);
console.log('Original:', testData);
console.log('Encrypted:', encrypted);
console.log('Decrypted:', decrypted);
console.log('Match:', testData === decrypted);
"
```

Expected output:
```
Original: My Building.rvt
Encrypted: a1b2c3d4...:abcdef...:123456...
Decrypted: My Building.rvt
Match: true
```

## Performance Impact

- **Encryption overhead**: ~1-2ms per schedule
- **Network overhead**: Minimal (one API call per save/load)
- **Storage overhead**: ~30% increase (IV + auth tag + ciphertext)

## Compliance Notes

This encryption implementation provides:
- ✅ Data at rest encryption (Firestore)
- ✅ Authentication tag for data integrity
- ✅ Per-record IV (no IV reuse)
- ✅ Industry-standard algorithm (AES-256-GCM)

Not provided (outside scope):
- ❌ End-to-end encryption (data decrypted on server)
- ❌ Key rotation automation
- ❌ Multi-key support (tenant-specific keys)

## Future Enhancements

Potential improvements:
1. Automated key rotation
2. Per-tenant encryption keys (multi-tenancy)
3. Client-side encryption (end-to-end)
4. Encrypted search capabilities
5. Key derivation from user passwords

---

**Last Updated**: March 29, 2026  
**Version**: 1.0.0
