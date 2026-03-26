/**
 * Query publishing logs for a specific user
 * Usage: node check-user-logs.js <email> [date]
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
    const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✓ Firebase Admin SDK initialized\n');
} catch (error) {
    console.error('✗ Failed to initialize Firebase:', error.message);
    process.exit(1);
}

const db = admin.firestore();

async function getUserLogs(email, dateFilter = null) {
    try {
        console.log(`Searching for logs from user: ${email}`);
        if (dateFilter) {
            console.log(`Date filter: ${dateFilter}\n`);
        }
        
        // Get all users to find the one with matching APS email
        const usersSnapshot = await db.collection('users').get();
        
        let targetUserId = null;
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            if (userData.apsEmail === email || userData.email === email) {
                targetUserId = userDoc.id;
                console.log(`✓ Found user: ${userDoc.id}`);
                console.log(`  Firebase Email: ${userData.email}`);
                console.log(`  APS Email: ${userData.apsEmail}`);
                console.log(`  APS Name: ${userData.apsFirstName} ${userData.apsLastName}\n`);
                break;
            }
        }
        
        if (!targetUserId) {
            console.log(`❌ No user found with email: ${email}\n`);
            return;
        }
        
        // Get publishing logs for this user
        let logsQuery = db.collection('users')
            .doc(targetUserId)
            .collection('publishingLogs')
            .orderBy('timestamp', 'desc');
        
        // Apply date filter if provided (YYYY-MM-DD format)
        if (dateFilter) {
            const startOfDay = new Date(dateFilter);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateFilter);
            endOfDay.setHours(23, 59, 59, 999);
            
            logsQuery = logsQuery
                .where('timestamp', '>=', startOfDay.getTime())
                .where('timestamp', '<=', endOfDay.getTime());
        }
        
        const logsSnapshot = await logsQuery.get();
        
        if (logsSnapshot.empty) {
            console.log('❌ No publishing logs found for this user\n');
            return;
        }
        
        console.log(`\n${'='.repeat(80)}`);
        console.log(`PUBLISHING LOGS (${logsSnapshot.size} entries)`);
        console.log('='.repeat(80));
        
        logsSnapshot.forEach((logDoc, index) => {
            const log = logDoc.data();
            const timestamp = new Date(log.timestamp);
            
            console.log(`\n[${index + 1}] ${logDoc.id}`);
            console.log(`${'─'.repeat(80)}`);
            console.log(`Time:       ${timestamp.toLocaleString()}`);
            console.log(`File:       ${log.fileName}`);
            console.log(`Type:       ${log.fileType || 'N/A'}`);
            console.log(`Status:     ${log.status}`);
            console.log(`Action:     ${log.action}`);
            
            if (log.workItemId) {
                console.log(`WorkItem:   ${log.workItemId}`);
            }
            
            if (log.details) {
                console.log(`Details:    ${log.details}`);
            }
            
            if (log.error) {
                console.log(`\n⚠️  ERROR:`);
                console.log(`    ${log.error}`);
            }
            
            if (log.helpfulTip) {
                console.log(`\n💡 Tip: ${log.helpfulTip}`);
            }
            
            // Show all fields for failed entries
            if (log.status === 'failed' || log.status === 'error') {
                console.log(`\nFull Log Data:`);
                console.log(JSON.stringify(log, null, 2));
            }
        });
        
        console.log(`\n${'='.repeat(80)}\n`);
        
        // Summary
        const statusCounts = {};
        logsSnapshot.forEach(doc => {
            const status = doc.data().status;
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        console.log('Summary:');
        Object.entries(statusCounts).forEach(([status, count]) => {
            const icon = status === 'success' ? '✓' : status === 'failed' ? '✗' : '⏳';
            console.log(`  ${icon} ${status}: ${count}`);
        });
        console.log();
        
    } catch (error) {
        console.error('❌ Error querying logs:', error.message);
        console.error(error);
    }
}

// Parse command line arguments
const email = process.argv[2];
const dateFilter = process.argv[3]; // Optional: YYYY-MM-DD format

if (!email) {
    console.error('❌ ERROR: Email address required\n');
    console.log('Usage: node check-user-logs.js <email> [date]');
    console.log('Examples:');
    console.log('  node check-user-logs.js mateja.kovacic@autodesk.com');
    console.log('  node check-user-logs.js mateja.kovacic@autodesk.com 2026-03-17\n');
    process.exit(1);
}

// Run the query
getUserLogs(email, dateFilter).then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
