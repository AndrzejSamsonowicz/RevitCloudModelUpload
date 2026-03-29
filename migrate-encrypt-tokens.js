/**
 * Migration Script: Encrypt Plaintext OAuth Tokens in Firestore
 * 
 * This script encrypts all existing plaintext OAuth tokens (apsToken, apsRefreshToken)
 * stored in Firestore users collection.
 * 
 * Run once after deploying the token encryption fix.
 * 
 * Usage: node migrate-encrypt-tokens.js
 */

require('dotenv').config();
const admin = require('firebase-admin');
const { encrypt } = require('./services/encryption');

// Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function migrateEncryptTokens() {
    try {
        console.log('🔒 Starting token encryption migration...\n');
        
        // Get all users
        const usersSnapshot = await db.collection('users').get();
        
        if (usersSnapshot.empty) {
            console.log('No users found in Firestore.');
            return;
        }
        
        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        
        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            
            console.log(`\nProcessing user: ${userData.email || userId}`);
            
            // Check if tokens exist and are NOT already encrypted
            const hasApsToken = userData.apsToken && typeof userData.apsToken === 'string';
            const hasRefreshToken = userData.apsRefreshToken && typeof userData.apsRefreshToken === 'string';
            
            if (!hasApsToken && !hasRefreshToken) {
                console.log('  ⊘ No tokens to encrypt');
                skippedCount++;
                continue;
            }
            
            // Check if tokens are already encrypted (encrypted format: iv:authTag:ciphertext)
            const tokenAlreadyEncrypted = userData.apsToken && userData.apsToken.split(':').length === 3;
            const refreshTokenAlreadyEncrypted = userData.apsRefreshToken && userData.apsRefreshToken.split(':').length === 3;
            
            if (tokenAlreadyEncrypted && refreshTokenAlreadyEncrypted) {
                console.log('  ✓ Tokens already encrypted');
                skippedCount++;
                continue;
            }
            
            try {
                const updateData = {};
                
                // Encrypt access token if it's plaintext
                if (hasApsToken && !tokenAlreadyEncrypted) {
                    updateData.apsToken = encrypt(userData.apsToken);
                    console.log('  🔐 Encrypted apsToken');
                }
                
                // Encrypt refresh token if it's plaintext
                if (hasRefreshToken && !refreshTokenAlreadyEncrypted) {
                    updateData.apsRefreshToken = encrypt(userData.apsRefreshToken);
                    console.log('  🔐 Encrypted apsRefreshToken');
                }
                
                if (Object.keys(updateData).length > 0) {
                    await db.collection('users').doc(userId).update(updateData);
                    console.log('  ✅ Migration successful');
                    migratedCount++;
                } else {
                    console.log('  ⊘ No changes needed');
                    skippedCount++;
                }
                
            } catch (error) {
                console.error(`  ❌ Error encrypting tokens for ${userId}:`, error.message);
                errorCount++;
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('🏁 Migration Complete!');
        console.log('='.repeat(60));
        console.log(`✅ Migrated: ${migratedCount} users`);
        console.log(`⊘  Skipped:  ${skippedCount} users`);
        console.log(`❌ Errors:   ${errorCount} users`);
        console.log('='.repeat(60) + '\n');
        
    } catch (error) {
        console.error('Fatal error during migration:', error);
        process.exit(1);
    }
}

// Run migration
migrateEncryptTokens()
    .then(() => {
        console.log('Migration script finished.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
