/**
 * Check Design Automation setup for a user (AppBundles and Activities)
 * Usage: node check-user-activities.js <userId>
 */

require('dotenv').config();
const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin SDK
try {
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✓ Firebase initialized\n');
} catch (error) {
    console.error('✗ Failed to initialize Firebase:', error.message);
    process.exit(1);
}

const db = admin.firestore();

async function checkUserDesignAutomation(userId) {
    try {
        // Get user document
        const userDoc = await db.collection('users').doc(userId).get();
        
        if (!userDoc.exists) {
            console.error(`❌ User not found: ${userId}\n`);
            return;
        }
        
        const userData = userDoc.data();
        console.log(`User: ${userData.email || userData.apsEmail}`);
        console.log(`APS Email: ${userData.apsEmail}`);
        console.log(`Firebase UID: ${userId}\n`);
        
        // Check if user has encrypted credentials
        if (!userData.encryptedClientId || !userData.encryptedClientSecret) {
            console.log('❌ No APS credentials stored for this user');
            console.log('   User is likely using default APS credentials\n');
            return;
        }
        
        // Decrypt credentials
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(process.env.ENCRYPTION_KEY, 'utf8').slice(0, 32);
        const iv = Buffer.from(userData.encryptionIV, 'hex');
        
        const decipherClientId = crypto.createDecipheriv(algorithm, key, iv);
        const decipherClientSecret = crypto.createDecipheriv(algorithm, key, iv);
        
        let clientId = decipherClientId.update(userData.encryptedClientId, 'hex', 'utf8');
        clientId += decipherClientId.final('utf8');
        
        let clientSecret = decipherClientSecret.update(userData.encryptedClientSecret, 'hex', 'utf8');
        clientSecret += decipherClientSecret.final('utf8');
        
        console.log(`Client ID: ${clientId}`);
        console.log(`Client Secret: ${'*'.repeat(clientSecret.length)}\n`);
        
        // Get 2-legged token
        console.log('Getting 2-legged OAuth token...');
        const tokenResponse = await axios.post(
            'https://developer.api.autodesk.com/authentication/v2/token',
            new URLSearchParams({
                grant_type: 'client_credentials',
                scope: 'code:all'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                }
            }
        );
        
        const token = tokenResponse.data.access_token;
        console.log('✓ Token obtained\n');
        
        // Get nickname
        const nicknameResponse = await axios.get(
            'https://developer.api.autodesk.com/da/us-east/v3/forgeapps/me',
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const nickname = nicknameResponse.data;
        console.log(`Forge App Nickname: ${nickname}\n`);
        
        // List AppBundles
        console.log('='.repeat(80));
        console.log('APP BUNDLES');
        console.log('='.repeat(80));
        
        try {
            const bundlesResponse = await axios.get(
                'https://developer.api.autodesk.com/da/us-east/v3/appbundles',
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            const bundles = bundlesResponse.data.data || [];
            const userBundles = bundles.filter(b => b.startsWith(nickname));
            
            if (userBundles.length === 0) {
                console.log('❌ No AppBundles found\n');
            } else {
                console.log(`Found ${userBundles.length} AppBundle(s):\n`);
                
                for (const bundleId of userBundles) {
                    // Get bundle details
                    const bundleDetails = await axios.get(
                        `https://developer.api.autodesk.com/da/us-east/v3/appbundles/${bundleId}`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    
                    const bundle = bundleDetails.data;
                    console.log(`  📦 ${bundleId}`);
                    console.log(`     Version: ${bundle.version}`);
                    console.log(`     Engine: ${bundle.engine}`);
                    console.log(`     Description: ${bundle.description || 'N/A'}`);
                    console.log();
                }
            }
        } catch (error) {
            console.log(`❌ Error listing AppBundles: ${error.response?.data?.title || error.message}\n`);
        }
        
        // List Activities
        console.log('='.repeat(80));
        console.log('ACTIVITIES');
        console.log('='.repeat(80));
        
        try {
            const activitiesResponse = await axios.get(
                'https://developer.api.autodesk.com/da/us-east/v3/activities',
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            const activities = activitiesResponse.data.data || [];
            const userActivities = activities.filter(a => a.startsWith(nickname));
            
            if (userActivities.length === 0) {
                console.log('❌ No Activities found\n');
                console.log('💡 User needs Activities created for Revit 2024, 2025, 2026\n');
            } else {
                console.log(`Found ${userActivities.length} Activity(ies):\n`);
                
                for (const activityId of userActivities) {
                    // Get activity details
                    const activityDetails = await axios.get(
                        `https://developer.api.autodesk.com/da/us-east/v3/activities/${activityId}`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    
                    const activity = activityDetails.data;
                    console.log(`  ⚡ ${activityId}`);
                    console.log(`     Version: ${activity.version}`);
                    console.log(`     Engine: ${activity.engine}`);
                    console.log(`     Description: ${activity.description || 'N/A'}`);
                    
                    // Determine Revit version from engine
                    const engineMatch = activity.engine.match(/Autodesk\.Revit(\+\d+)?/);
                    if (engineMatch) {
                        const revitVersion = activity.engine.includes('+2024') ? '2024' :
                                           activity.engine.includes('+2025') ? '2025' :
                                           activity.engine.includes('+2026') ? '2026' : 'Unknown';
                        console.log(`     Revit Version: ${revitVersion}`);
                    }
                    console.log();
                }
            }
        } catch (error) {
            console.log(`❌ Error listing Activities: ${error.response?.data?.title || error.message}\n`);
        }
        
        // Summary and recommendations
        console.log('='.repeat(80));
        console.log('RECOMMENDATIONS');
        console.log('='.repeat(80));
        console.log('To support Revit 2024/2025/2026 files, you need:');
        console.log('  1. ✅ One AppBundle (supports multiple Revit versions)\n');
        console.log('  2. ⚠️  Three Activities:');
        console.log('     - Activity for Revit 2024 engine');
        console.log('     - Activity for Revit 2025 engine');
        console.log('     - Activity for Revit 2026 engine\n');
        console.log('Create missing Activities using the create-activity API endpoint.\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response?.data) {
            console.error('API Error:', error.response.data);
        }
    }
}

// Parse command line arguments
const userId = process.argv[2];

if (!userId) {
    console.error('❌ ERROR: User ID required\n');
    console.log('Usage: node check-user-activities.js <userId>');
    console.log('Example: node check-user-activities.js 7XAR9Qfm8WQ83Jtog0XqY5HpvkJ3\n');
    process.exit(1);
}

// Run the check
checkUserDesignAutomation(userId).then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
