/**
 * Reset User Data - Clear OAuth tokens and schedules while preserving account
 * 
 * This script clears:
 * - OAuth tokens and session data
 * - Publishing schedules
 * - Encrypted credentials
 * 
 * This preserves:
 * - User account (email, createdAt)
 * - License information (licenseKey, licenseStatus, etc.)
 * 
 * Usage: node reset-user-data.js <email>
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function resetUserData(userEmail) {
    try {
        // Find user by email
        const usersSnapshot = await db.collection('users')
            .where('email', '==', userEmail)
            .limit(1)
            .get();
        
        if (usersSnapshot.empty) {
            console.log(`❌ User not found: ${userEmail}`);
            return;
        }
        
        const userDoc = usersSnapshot.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();
        
        console.log(`\n📋 Found user: ${userEmail} (${userId})`);
        console.log(`   License: ${userData.licenseKey} (${userData.licenseStatus})`);
        console.log(`   Created: ${userData.createdAt?.toDate?.() || 'N/A'}\n`);
        
        console.log('🗑️  Clearing user data...\n');
        
        // Clear OAuth tokens and session data
        const updates = {
            // OAuth data
            apsToken: admin.firestore.FieldValue.delete(),
            apsRefreshToken: admin.firestore.FieldValue.delete(),
            apsTokenExpiry: admin.firestore.FieldValue.delete(),
            apsUserId: admin.firestore.FieldValue.delete(),
            apsEmail: admin.firestore.FieldValue.delete(),
            apsFirstName: admin.firestore.FieldValue.delete(),
            apsLastName: admin.firestore.FieldValue.delete(),
            
            // Session data
            sessionId: admin.firestore.FieldValue.delete(),
            lastLogin: admin.firestore.FieldValue.delete(),
            
            // Encrypted credentials
            encryptedCredentials: admin.firestore.FieldValue.delete(),
            credentialsIV: admin.firestore.FieldValue.delete(),
            encryptedClientId: admin.firestore.FieldValue.delete(),
            encryptedClientSecret: admin.firestore.FieldValue.delete(),
            clientIdIV: admin.firestore.FieldValue.delete(),
            clientSecretIV: admin.firestore.FieldValue.delete(),
            credentialsUpdatedAt: admin.firestore.FieldValue.delete(),
            encryptionIV: admin.firestore.FieldValue.delete(),
            
            // Publishing schedules
            publishingSchedules: admin.firestore.FieldValue.delete(),
            schedulesUpdated: admin.firestore.FieldValue.delete()
        };
        
        await db.collection('users').doc(userId).update(updates);
        
        console.log('✅ Cleared OAuth tokens and session data');
        console.log('✅ Cleared encrypted credentials');
        console.log('✅ Cleared publishing schedules');
        console.log('\n' + '='.repeat(60));
        console.log('✨ User data reset complete!');
        console.log('='.repeat(60));
        console.log(`\n📌 User ${userEmail} is now in a clean state:`);
        console.log('   - Account preserved (email, userId)');
        console.log('   - License preserved (active until ' + (userData.licenseExpiry || 'N/A') + ')');
        console.log('   - OAuth tokens cleared');
        console.log('   - Credentials cleared');
        console.log('   - Schedules cleared\n');
        console.log('👤 Next steps for user:');
        console.log('   1. Log in with Firebase (email/password)');
        console.log('   2. Go to Settings');
        console.log('   3. Enter APS credentials (Client ID + Secret)');
        console.log('   4. Complete Autodesk OAuth login');
        console.log('   5. Create new publishing schedules\n');
        
    } catch (error) {
        console.error('❌ Error resetting user data:', error);
        throw error;
    }
}

// Get email from command line
const userEmail = process.argv[2];

if (!userEmail) {
    console.error('Usage: node reset-user-data.js <email>');
    console.error('Example: node reset-user-data.js mkovacic@digibuild.ch');
    process.exit(1);
}

// Run reset
resetUserData(userEmail)
    .then(() => {
        console.log('Script completed successfully.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Script failed:', error);
        process.exit(1);
    });
