const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkPublishingLogs() {
  const userId = '7XAR9Qfm8WQ83Jtog0XqY5HpvkJ3';
  
  console.log(`\n=== Publishing Logs for User: ${userId} ===\n`);
  
  try {
    const logsRef = db.collection('publishingLogs');
    const snapshot = await logsRef
      .where('userId', '==', userId)
      .get();
    
    if (snapshot.empty) {
      console.log('No publishing logs found for this user.');
      return;
    }
    
    // Convert to array and sort by timestamp (newest first)
    const logs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      let timestamp = null;
      
      try {
        if (data.timestamp?.toDate) {
          timestamp = data.timestamp.toDate();
        } else if (data.timestamp) {
          timestamp = new Date(data.timestamp);
        }
        // Validate the timestamp
        if (timestamp && isNaN(timestamp.getTime())) {
          timestamp = null;
        }
      } catch (e) {
        // Leave timestamp as null if conversion fails
        timestamp = null;
      }
      
      logs.push({ ...data, timestamp });
    });
    
    // Sort by timestamp (newest first), put null timestamps at the end
    logs.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return b.timestamp - a.timestamp;
    });
    
    const displayLogs = logs.slice(0, 20); // Show last 20
    
    console.log(`Found ${logs.length} publishing attempts (showing last 20):\n`);
    
    displayLogs.forEach((data, index) => {
      console.log(`--- Attempt #${index + 1} ---`);
      console.log(`File: ${data.fileName || 'N/A'}`);
      
      if (data.timestamp) {
        console.log(`Time: ${data.timestamp.toISOString()} (${data.timestamp.toLocaleString('en-US', { timeZone: 'Europe/Vienna' })} Vienna)`);
      } else {
        console.log(`Time: N/A (invalid or missing timestamp)`);
      }
      
      console.log(`Status: ${data.status || 'N/A'}`);
      console.log(`Type: ${data.publishType || 'N/A'}`);
      
      if (data.workItemId) {
        console.log(`WorkItem ID: ${data.workItemId}`);
      }
      
      if (data.error) {
        console.log(`Error: ${data.error}`);
      }
      
      if (data.reportUrl) {
        console.log(`Report: ${data.reportUrl}`);
      }
      
      console.log('');
    });
    
    // Also check user's schedules
    console.log('\n=== Current Schedules ===\n');
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const schedules = userData.publishingSchedules || [];
      
      if (schedules.length === 0) {
        console.log('No schedules configured.');
      } else {
        console.log(`Found ${schedules.length} scheduled publishes:\n`);
        schedules.forEach((schedule, idx) => {
          const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          console.log(`Schedule #${idx + 1}:`);
          console.log(`  File: ${schedule.fileName}`);
          console.log(`  Day: ${days[schedule.day]} (${schedule.day})`);
          console.log(`  Time: ${schedule.time}`);
          console.log(`  Timezone: ${schedule.timezone || 'N/A'}`);
          console.log('');
        });
      }
    } else {
      console.log('User document not found.');
    }
    
  } catch (error) {
    console.error('Error querying Firestore:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

checkPublishingLogs();
