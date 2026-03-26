// Quick script to check WorkItem status
const axios = require('axios');
const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config();

if (!admin.apps.length) {
    let serviceAccount;
    
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        serviceAccount = {
            type: "service_account",
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL
        };
    }
    
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
        });
    }
}

const workItems = [
    { id: 'a37009a9c60f495e9b10a34cc8e1ca12', name: 'architekci czerwoni.rvt' },
    { id: 'a563868e8ff54af393b277bbcc61e9ab', name: 'architekci niebiescy.rvt' }
];

async function decryptUserCredentials(userId) {
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData.encryptedClientId) return null;
    
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

async function checkWorkItems() {
    console.log('🔍 Checking WorkItem Status...\n');
    
    const userId = '5gyOpMRMEqdi604bV5wombRNSPB2';
    const credentials = await decryptUserCredentials(userId);
    
    const tokenResponse = await axios.post(
        'https://developer.api.autodesk.com/authentication/v2/token',
        new URLSearchParams({
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            grant_type: 'client_credentials',
            scope: 'code:all'
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    
    const ACCESS_TOKEN = tokenResponse.data.access_token;
    
    for (const item of workItems) {
        try {
            const response = await axios.get(
                `https://developer.api.autodesk.com/da/us-east/v3/workitems/${item.id}`,
                {
                    headers: {
                        'Authorization': `Bearer ${ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = response.data;
            const statusIcon = data.status === 'success' ? '✅' : 
                               data.status === 'failed' ? '❌' : 
                               data.status === 'inprogress' ? '⏳' : 
                               data.status === 'pending' ? '⏸' : '?';

            console.log(`${statusIcon} ${item.name}`);
            console.log(`   Status: ${data.status}`);
            if (data.progress) console.log(`   Progress: ${data.progress}`);
            
            // Get detailed report
            if (data.reportUrl) {
                const reportResponse = await axios.get(data.reportUrl);
                const report = reportResponse.data;
                const lines = report.split('\n');
                
                const saveMsg = lines.find(l => l.includes('Saved single-user cloud model') || l.includes('cloud model saved'));
                const errorMsg = lines.find(l => l.toLowerCase().includes('error:'));
                
                if (saveMsg) {
                    console.log(`   💾 ${saveMsg.trim()}`);
                }
                if (errorMsg) {
                    console.log(`   ⚠️  ${errorMsg.trim()}`);
                }
            }
            console.log('');
        } catch (error) {
            console.log(`✗ ${item.name}`);
            console.log(`   Error: ${error.response?.data?.detail || error.message}`);
            console.log('');
        }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('📋 CHECK ACC FOR NEW VERSIONS:');
    console.log('  • czerwoni should be v22 (was v21)');
    console.log('  • niebiescy should be v15 (was v14)');
    console.log('='.repeat(70));
}

checkWorkItems().catch(console.error);
