# Firebase Cloud Functions for Revit Model Publishing

This directory contains Firebase Cloud Functions that enable automatic scheduled publishing of Revit cloud models.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   firebase functions:config:set server.url="http://YOUR_SERVER_IP:3000"
   firebase functions:config:set cloud.auth_key="YOUR_SECRET_KEY"
   ```

3. **Deploy:**
   ```bash
   cd ..
   firebase deploy --only functions
   ```

## Functions

### `checkScheduledPublishing`
- **Type:** Scheduled (PubSub trigger)
- **Schedule:** Every 15 minutes (`*/15 * * * *`)
- **Purpose:** Checks all users' publishing schedules and triggers publishing for matching files

### `triggerScheduleCheck`
- **Type:** HTTP endpoint
- **Purpose:** Manual trigger for testing
- **URL:** `https://us-central1-revitcloudmodelpublisher.cloudfunctions.net/triggerScheduleCheck`

## Local Development

Test locally using Firebase emulators:

```bash
npm run serve
```

## Deployment

Deploy only functions:
```bash
firebase deploy --only functions
```

Deploy with firestore rules:
```bash
firebase deploy
```

## Monitoring

View logs:
```bash
firebase functions:log --only checkScheduledPublishing
npm run logs
```

## Environment Variables

Set via Firebase CLI:
```bash
firebase functions:config:set key.value="setting"
```

Get current config:
```bash
firebase functions:config:get
```

## Requirements

- Node.js 18+
- Firebase Blaze plan (pay-as-you-go)
- Firebase CLI: `npm install -g firebase-tools`

## Documentation

See [FIREBASE_FUNCTIONS_SETUP.md](../FIREBASE_FUNCTIONS_SETUP.md) for complete setup instructions.
