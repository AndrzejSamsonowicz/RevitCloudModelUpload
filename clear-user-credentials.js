/**
 * Clear encrypted credentials for a user
 * Run this when encryption key changes to allow users to re-authenticate
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
    let serviceAccount;
    
    // Try to load from file path first
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        try {
            serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
        } catch (err) {
            // Try alternative filename
            try {
                serviceAccount = require('./firebase-service-account.json');
            } catch (err2) {
                console.error('Could not load Firebase service account file');
                console.error('Tried:', process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'and ./firebase-service-account.json');
            }
        }
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        // Use individual credentials from environment variables
        serviceAccount = {
            type: "service_account",
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL
        };
    }
    
    if (!serviceAccount) {
        console.error('Firebase credentials not found');
        console.error('Either set FIREBASE_SERVICE_ACCOUNT_PATH in .env or configure individual Firebase credentials');
        process.exit(1);
    }
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function clearUserCredentials(userEmail) {
    try {
        // Find user by email
        const usersSnapshot = await db.collection('users')
            .where('email', '==', userEmail)
            .limit(1)
            .get();
        
        if (usersSnapshot.empty) {
            console.log(`User not found: ${userEmail}`);
            return;
        }
        
        const userDoc = usersSnapshot.docs[0];
        const userId = userDoc.id;
        
        console.log(`Found user: ${userEmail} (${userId})`);
        
        // Clear encrypted credentials fields
        await db.collection('users').doc(userId).update({
            encryptedCredentials: admin.firestore.FieldValue.delete(),
            credentialsIV: admin.firestore.FieldValue.delete(),
            encryptedClientId: admin.firestore.FieldValue.delete(),
            encryptedClientSecret: admin.firestore.FieldValue.delete(),
            clientIdIV: admin.firestore.FieldValue.delete(),
            clientSecretIV: admin.firestore.FieldValue.delete()
        });
        
        console.log(`✓ Cleared encrypted credentials for ${userEmail}`);
        console.log('User can now log in and re-enter their credentials');
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
    console.log('Usage: node clear-user-credentials.js <user-email>');
    console.log('Example: node clear-user-credentials.js samson090281@yahoo.com');
    process.exit(1);
}

clearUserCredentials(email);
