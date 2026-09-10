/**
 * Grant admin to a user by creating a document at admins/{uid}.
 * Admin status is "a doc exists at admins/{uid}" (see services/adminCheck.js) —
 * the same model as ACC_User_Management / forma-user-management.
 *
 * Usage:   node set-admin.js <email>
 * Revoke:  delete the admins/{uid} doc in the Firestore console (or add a --revoke flag).
 *
 * Auth: uses Application Default Credentials (attached VM service account). For local
 * runs, set GOOGLE_APPLICATION_CREDENTIALS or run `gcloud auth application-default login`.
 * FIREBASE_PROJECT_ID names the target project.
 */

require('dotenv').config();
const admin = require('firebase-admin');

try {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        admin.initializeApp({
            credential: admin.credential.cert(require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH))
        });
    } else {
        admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
    }
    console.log('✓ Firebase Admin SDK initialized');
} catch (error) {
    console.error('✗ Failed to initialize Firebase:', error.message);
    process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

async function setAdmin(email) {
    const userRecord = await auth.getUserByEmail(email);
    console.log(`✓ Found user: ${userRecord.uid}`);

    await db.collection('admins').doc(userRecord.uid).set({
        email: email,
        role: 'admin',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`\n✅ ${email} is now an admin (admins/${userRecord.uid} created).`);
}

const email = process.argv[2];
if (!email) {
    console.error('Usage: node set-admin.js <email>');
    process.exit(1);
}

setAdmin(email)
    .then(() => process.exit(0))
    .catch((error) => {
        if (error.code === 'auth/user-not-found') {
            console.error(`❌ No user found with email: ${email}. Register the account first.`);
        } else {
            console.error('❌ ERROR:', error.message);
        }
        process.exit(1);
    });
