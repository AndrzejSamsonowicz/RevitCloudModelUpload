const admin = require('firebase-admin');
const axios = require('axios');
const crypto = require('crypto');

// Initialize Firebase Admin
const serviceAccount = require('./revitcloudmodelpublisher-firebase-adminsdk-fbsvc-91a99e0dbe.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const DESIGN_AUTOMATION_BASE = 'https://developer.api.autodesk.com/da/us-east/v3';

async function decryptUserCredentials(userId) {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
        return null;
    }
    
    const userData = userDoc.data();
    
    if (!userData.encryptedClientId || !userData.encryptedClientSecret) {
        return null;
    }
    
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32bytes', 'utf8').slice(0, 32);
    const iv = Buffer.from(userData.encryptionIV, 'hex');
    
    const decipherClientId = crypto.createDecipheriv(algorithm, key, iv);
    const decipherClientSecret = crypto.createDecipheriv(algorithm, key, iv);
    
    let clientId = decipherClientId.update(userData.encryptedClientId, 'hex', 'utf8');
    clientId += decipherClientId.final('utf8');
    
    let clientSecret = decipherClientSecret.update(userData.encryptedClientSecret, 'hex', 'utf8');
    clientSecret += decipherClientSecret.final('utf8');
    
    return { clientId, clientSecret };
}

async function get2LeggedToken(clientId, clientSecret) {
    const response = await axios.post(
        'https://developer.api.autodesk.com/authentication/v2/token',
        new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
            scope: 'code:all'
        }),
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
    );
    return response.data.access_token;
}

async function checkWorkItem(workItemId, token) {
    try {
        const response = await axios.get(
            `${DESIGN_AUTOMATION_BASE}/workitems/${workItemId}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );
        return response.data;
    } catch (error) {
        console.error(`Error checking WorkItem ${workItemId}:`, error.response?.data || error.message);
        return null;
    }
}

async function main() {
    const userId  = '5gyOpMRMEqdi604bV5wombRNSPB2'; // Your Firebase user ID
    const workItemIds = [
        'bb9fe71d38ea4df68fab312420b97338', // czerwoni
        '439733d33be2403d8f6d2abb7239fdd5'  // niebiescy
    ];
    
    console.log('Getting user credentials...');
    const credentials = await decryptUserCredentials(userId);
    
    if (!credentials) {
        console.error('Failed to get user credentials');
        process.exit(1);
    }
    
    console.log(`Client ID: ${credentials.clientId.substring(0, 10)}...`);
    
    console.log('Getting 2-legged token...');
    const token = await get2LeggedToken(credentials.clientId, credentials.clientSecret);
    console.log('✓ Token obtained\n');
    
    for (const workItemId of workItemIds) {
        console.log(`\n=== Checking WorkItem: ${workItemId} ===`);
        const data = await checkWorkItem(workItemId, token);
        
        if (data) {
            console.log('Status:', data.status);
            console.log('Progress:', data.progress);
            if (data.stats) {
                console.log('Stats:', JSON.stringify(data.stats, null, 2));
            }
            if (data.reportUrl) {
                console.log('\nReport URL:', data.reportUrl);
                try {
                    const reportResponse = await axios.get(data.reportUrl);
                    console.log('\n=== REPORT ===');
                    console.log(reportResponse.data);
                    console.log('=== END REPORT ===\n');
                } catch (err) {
                    console.error('Failed to fetch report:', err.message);
                }
            }
        }
    }
    
    process.exit(0);
}

main().catch(console.error);
