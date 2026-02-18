const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const { defineString } = require('firebase-functions/params');

// Define environment parameters
const serverUrl = defineString('SERVER_URL', {
  default: 'http://34.65.169.15:3000'
});
const authKey = defineString('CLOUD_FUNCTION_AUTH_KEY', {
  default: 'h48qZSyxDkdbR1weAzFfjOuVYQtmETs2'
});

admin.initializeApp();
const db = admin.firestore();

/**
 * Scheduled Cloud Function that runs every 15 minutes
 * Checks all users' publishing schedules and triggers publishing for matching files
 */
exports.checkScheduledPublishing = functions.region('europe-west6').pubsub
  .schedule('*/15 * * * *') // Run every 15 minutes
  .timeZone('UTC') // Initial timezone, will be converted per schedule
  .onRun(async () => {
    console.log('Starting scheduled publishing check...');
    
    try {
      const now = new Date();
      const currentUTCTime = now.toISOString();
      console.log(`Current UTC time: ${currentUTCTime}`);
      
      // Get all users with schedules
      const usersSnapshot = await db.collection('users').get();
      
      if (usersSnapshot.empty) {
        console.log('No users found');
        return null;
      }
      
      const publishingPromises = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        
        if (!userData.publishingSchedules || userData.publishingSchedules.length === 0) {
          continue;
        }
        
        console.log(`Checking schedules for user: ${userId}`);
        
        // Check each schedule
        for (const schedule of userData.publishingSchedules) {
          if (shouldPublishNow(schedule, now)) {
            console.log(`Triggering publish for file: ${schedule.fileName} (${schedule.fileId})`);
            
            // Trigger publishing
            const promise = triggerPublishing(userId, schedule, userData);
            publishingPromises.push(promise);
          }
        }
      }
      
      // Wait for all publishing operations to complete
      const results = await Promise.allSettled(publishingPromises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`Publishing check complete: ${successful} successful, ${failed} failed`);
      
      return { successful, failed, total: results.length };
      
    } catch (error) {
      console.error('Error in scheduled publishing check:', error);
      throw error;
    }
  });

/**
 * Check if a schedule should trigger publishing now
 * @param {Object} schedule - Schedule object with days, time, timezone
 * @param {Date} now - Current date/time
 * @returns {boolean} - True if should publish now
 */
function shouldPublishNow(schedule, now) {
  try {
    // Get current time in the schedule's timezone
    const scheduleTime = schedule.time; // Format: "HH:MM"
    const [scheduleHour, scheduleMinute] = scheduleTime.split(':').map(Number);
    
    // Convert current UTC time to schedule's timezone
    const options = {
      timeZone: schedule.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    
    const localHour = parseInt(parts.find(p => p.type === 'hour').value);
    const localMinute = parseInt(parts.find(p => p.type === 'minute').value);
    
    // Get day of week (0 = Sunday, 6 = Saturday)
    const localDate = new Date(now.toLocaleString('en-US', { timeZone: schedule.timezone }));
    const localDay = localDate.getDay();
    
    console.log(`Schedule check for ${schedule.fileName}: scheduled for ${schedule.time} on days ${schedule.days}, current time is ${localHour}:${String(localMinute).padStart(2, '0')} on day ${localDay}`);
    
    // Check if current day is in schedule
    if (!schedule.days.includes(localDay)) {
      console.log(`  Day ${localDay} not in schedule ${schedule.days}`);
      return false;
    }
    
    // Check if current time matches schedule (within 15-minute window for Cloud Function execution)
    // The function runs every 15 minutes, so if scheduled time is within current 15-min window, trigger it
    const scheduledMinutes = (scheduleHour * 60) + scheduleMinute;
    const currentMinutes = (localHour * 60) + localMinute;
    
    // Round current time down to nearest 15-min interval
    const intervalStart = Math.floor(currentMinutes / 15) * 15;
    
    // Check if scheduled time falls within this 15-minute interval
    const timeMatches = scheduledMinutes >= intervalStart && scheduledMinutes < intervalStart + 15;
    
    console.log(`  Time check: scheduled=${scheduledMinutes}min, current=${currentMinutes}min, interval=${intervalStart}-${intervalStart+15}, matches=${timeMatches}`);
    
    return timeMatches;
    
  } catch (error) {
    console.error('Error checking schedule:', error, schedule);
    return false;
  }
}

/**
 * Trigger Design Automation API to publish a file
 * @param {string} userId - User ID
 * @param {Object} schedule - Schedule object
 */
async function triggerPublishing(userId, schedule) {
  try {
    // Get the VM server URL and auth key from params
    const serverUrlValue = serverUrl.value();
    const authKeyValue = authKey.value();
    
    // Prepare the publishing request
    const publishData = {
      userId: userId,
      fileId: schedule.fileId,
      fileName: schedule.fileName,
      projectGuid: schedule.projectGuid,
      modelGuid: schedule.modelGuid,
      region: schedule.region || 'US',
      engineVersion: schedule.engineVersion || '2024'
    };
    
    console.log(`Publishing file: ${schedule.fileName} for user: ${userId}`);
    
    // Make request to the server's scheduled publish endpoint
    const response = await axios.post(
      `${serverUrlValue}/api/design-automation/scheduled-publish`,
      publishData,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Cloud-Function-Auth': authKeyValue
        },
        timeout: 30000 // 30 second timeout
      }
    );
    
    console.log(`Publish response for ${schedule.fileName}:`, response.data);
    
    // Log the publishing event in Firestore
    await db.collection('publishingLogs').add({
      userId: userId,
      fileId: schedule.fileId,
      fileName: schedule.fileName,
      scheduledTime: `${schedule.time} (${schedule.timezone})`,
      actualTime: new Date().toISOString(),
      status: 'success',
      workItemId: response.data.data?.workItemId,
      response: response.data
    });
    
    return response.data;
    
  } catch (error) {
    console.error(`Error publishing file ${schedule.fileName}:`, error.message);
    
    // Log the error in Firestore
    await db.collection('publishingLogs').add({
      userId: userId,
      fileId: schedule.fileId,
      fileName: schedule.fileName,
      scheduledTime: `${schedule.time} (${schedule.timezone})`,
      actualTime: new Date().toISOString(),
      status: 'error',
      error: error.message
    });
    
    throw error;
  }
}

/**
 * HTTP endpoint to manually trigger schedule check (for testing)
 */
exports.triggerScheduleCheck = functions.region('europe-west6').https.onRequest(async (req, res) => {
  try {
    const result = await exports.checkScheduledPublishing.run();
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error in manual trigger:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
