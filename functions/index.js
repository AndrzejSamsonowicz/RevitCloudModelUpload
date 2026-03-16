const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();
const db = admin.firestore();

/**
 * Scheduled Cloud Function that runs every 5 minutes
 * Checks all users' publishing schedules and triggers publishing for matching files
 */
exports.checkScheduledPublishing = functions.region('europe-west6').pubsub
  .schedule('*/5 * * * *') // Run every 5 minutes
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
    
    // Check if current time matches schedule (within 5-minute window for Cloud Function execution)
    // The function runs every 5 minutes, so if scheduled time is within current 5-min window, trigger it
    const scheduledMinutes = (scheduleHour * 60) + scheduleMinute;
    const currentMinutes = (localHour * 60) + localMinute;
    
    // Round current time down to nearest 5-min interval
    const intervalStart = Math.floor(currentMinutes / 5) * 5;
    
    // Check if scheduled time falls within this 5-minute interval
    const timeMatches = scheduledMinutes >= intervalStart && scheduledMinutes < intervalStart + 5;
    
    console.log(`  Time check: scheduled=${scheduledMinutes}min, current=${currentMinutes}min, interval=${intervalStart}-${intervalStart+5}, matches=${timeMatches}`);
    
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
    // Hardcoded values (params API not working reliably)
    const serverUrlValue = 'http://34.65.169.15:3000';
    const authKeyValue = 'h48qZSyxDkdbR1weAzFfjOuVYQtmETs2';
    
    // Prepare the publishing request
    const publishData = {
      userId: userId,
      fileId: schedule.fileId,
      fileName: schedule.fileName,
      projectId: schedule.projectId, // Project ID in b.xxx format
      projectGuid: schedule.projectGuid,
      modelGuid: schedule.modelGuid,
      region: schedule.region || 'US',
      engineVersion: schedule.engineVersion || '2024',
      extensionType: schedule.extensionType,
      isCloudModel: schedule.isCloudModel
    };
    
    console.log(`Publishing file: ${schedule.fileName} for user: ${userId}`);
    console.log(`  File type: ${schedule.extensionType}, Model Type: ${schedule.modelType}`);
    
    // Check if this is an RCM file (Revit Cloud Model)
    // RCM = singleuser, C4R = multiuser
    const isRCM = schedule.modelType === 'singleuser';
    
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
    
    // Get workItemId
    const workItemId = response.data.data?.workItemId;
    
    if (!workItemId) {
      throw new Error('No workItemId returned from server');
    }
    
    // Save initial log entry - webhook will update it when workitem completes
    await db.collection('publishingLogs').add({
      userId: userId,
      fileId: schedule.fileId,
      fileName: schedule.fileName,
      fileType: schedule.extensionType || 'Unknown',
      isRCM: isRCM,
      isC4R: !isRCM && schedule.isCloudModel,
      scheduledTime: `${schedule.time} (${schedule.timezone})`,
      actualTime: new Date().toISOString(),
      status: 'pending', // Will be updated by webhook
      workItemId: workItemId,
      message: isRCM ? 'Publishing RCM file via Design Automation...' : 'Publishing C4R file...'
    });
    
    return response.data;
    
  } catch (error) {
    console.error(`Error publishing file ${schedule.fileName}:`, error.message);
    console.error('Full error:', error.response?.data || error);
    
    // Determine if this is an RCM file (use existing schedule data)
    // RCM = singleuser, C4R = multiuser
    const fileIsRCM = schedule.modelType === 'singleuser';
    let errorMessage = error.message;
    let helpfulTip = '';
    
    // Provide helpful error messages based on error type
    if (fileIsRCM) {
      errorMessage = 'RCM files require Cloud Models for Revit access. This user may not have the required permissions to publish RCM files via Design Automation.';
    } else if (error.response?.status === 401 || error.message.includes('401')) {
      errorMessage = '🔒 Authentication expired. Please log out and log back in to refresh your credentials.';
      helpfulTip = 'Your Autodesk login session has expired. Log out and log back in to continue scheduled publishing.';
    } else if (error.response?.data?.error) {
      errorMessage = error.response.data.error;
    }
    
    // Log the error in Firestore with detailed information
    await db.collection('publishingLogs').add({
      userId: userId,
      fileId: schedule.fileId,
      fileName: schedule.fileName,
      fileType: schedule.extensionType || 'Unknown',
      isRCM: fileIsRCM,
      isC4R: !fileIsRCM && schedule.isCloudModel,
      scheduledTime: `${schedule.time} (${schedule.timezone})`,
      actualTime: new Date().toISOString(),
      status: 'error',
      message: errorMessage,
      error: errorMessage,
      helpfulTip: helpfulTip,
      originalError: error.message,
      statusCode: error.response?.status
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
    console.error('Error triggering schedule check:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Poll workitem status for pending logs and update them
 * Runs every 2 minutes to check completion
 */
exports.checkWorkItemStatus = functions.region('europe-west6').pubsub
  .schedule('*/2 * * * *') // Run every 2 minutes
  .timeZone('UTC')
  .onRun(async () => {
    console.log('Checking workitem status for pending logs...');
    
    try {
      // Use environment variables directly
      const serverUrlValue = process.env.SERVER_URL || 'http://localhost:3000';
      const authKeyValue = process.env.CLOUD_FUNCTION_AUTH_KEY;
      
      console.log(`Using server URL: ${serverUrlValue}`);
      
      // Call server endpoint to check pending workitems
      const response = await axios.post(
        `${serverUrlValue}/api/workitem-status/check-pending`,
        {},
        {
          headers: {
            'authKey': authKeyValue
          },
          timeout: 30000
        }
      );
      
      console.log('WorkItem check response:', response.data);
      return response.data;
      
    } catch (error) {
      console.error('Error checking workitem status:', error.message);
      throw error;
    }
  });

/**
 * HTTP endpoint to manually trigger workitem status check (for testing)
 */
exports.triggerWorkItemCheck = functions.region('europe-west6').https.onRequest(async (req, res) => {
  try {
    const result = await exports.checkWorkItemStatus.run();
    res.json({ success: true, result });
  } catch (error) {
    console.error('Error triggering workitem check:', error);
    res.status(500).json({ error: error.message });
  }
});

