/**
 * Script to set admin status for a user
 * Usage: node set-admin.js <email>
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✓ Firebase Admin SDK initialized');
} catch (error) {
    console.error('✗ Failed to initialize Firebase:', error.message);
    process.exit(1);
}

const db = admin.firestore();
const auth = admin.auth();

async function setAdmin(email) {
    try {
        console.log(`\nSearching for user: ${email}`);
        
        // Get user from Firebase Auth
        const userRecord = await auth.getUserByEmail(email);
        console.log(`✓ Found user: ${userRecord.uid}`);
        
        // Check if user document exists in Firestore
        const userDoc = await db.collection('users').doc(userRecord.uid).get();
        
        if (!userDoc.exists) {
            // Create user document if it doesn't exist
            console.log('Creating new user document...');
            await db.collection('users').doc(userRecord.uid).set({
                email: email,
                isAdmin: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('✓ User document created with admin status');
        } else {
            // Update existing user document
            console.log('Updating existing user document...');
            await db.collection('users').doc(userRecord.uid).update({
                isAdmin: true,
                adminSetAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log('✓ Admin status updated');
        }
        
        console.log(`\n✅ SUCCESS: ${email} is now an admin!`);
        console.log(`User ID: ${userRecord.uid}`);
        console.log(`\nYou can now access http://34.65.169.15:3000/admin\n`);
        
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            console.error(`❌ ERROR: No user found with email: ${email}`);
            console.log('\nMake sure the user is registered in Firebase Authentication first.');
        } else {
            console.error('❌ ERROR:', error.message);
        }
        process.exit(1);
    }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
    console.error('❌ ERROR: Email address required');
    console.log('\nUsage: node set-admin.js <email>');
    console.log('Example: node set-admin.js samson090281@gmail.com\n');
    process.exit(1);
}

// Run the script
setAdmin(email).then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
