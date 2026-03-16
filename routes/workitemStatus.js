const express = require('express');
const router = express.Router();
const axios = require('axios');
const admin = require('firebase-admin');
const apsClient = require('../services/apsClient');

/**
 * Check workitem status and update Firestore
 * Called by Cloud Function to poll workitem completion
 */
router.post('/check-pending', async (req, res) => {
    try {
        const { authKey } = req.headers;
        const expectedKey = process.env.CLOUD_FUNCTION_AUTH_KEY;
        
        if (!expectedKey || authKey !== expectedKey) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        const db = admin.firestore();
        
        // Get all pending logs with workItemId
        const pendingLogsSnapshot = await db.collection('publishingLogs')
            .where('status', '==', 'pending')
            .limit(50)
            .get();
        
        if (pendingLogsSnapshot.empty) {
            console.log('[WorkItem Check] No pending logs found');
            return res.json({ checked: 0, updated: 0 });
        }
        
        console.log(`[WorkItem Check] Found ${pendingLogsSnapshot.docs.length} pending logs to check`);
        
        let updatedCount = 0;
        
        for (const logDoc of pendingLogsSnapshot.docs) {
            const logData = logDoc.data();
            const workItemId = logData.workItemId;
            const userId = logData.userId;
            
            if (!workItemId) {
                console.log(`[WorkItem Check] Log ${logDoc.id} has no workItemId, skipping`);
                continue;
            }
            
            console.log(`[WorkItem Check] Checking workItemId: ${workItemId} for user: ${userId}`);
            
            // Check if log is too old (more than 10 minutes)
            const logAge = Date.now() - new Date(logData.actualTime).getTime();
            if (logAge > 10 * 60 * 1000) {
                console.log(`[WorkItem Check] WorkItem ${workItemId} is too old (${Math.floor(logAge / 60000)} minutes), marking as timeout`);
                await logDoc.ref.update({
                    status: 'error',
                    message: 'WorkItem timed out. The publishing process took too long to complete.',
                    error: 'Timeout',
                    completedTime: new Date().toISOString()
                });
                updatedCount++;
                continue;
            }
            
            // Get user's token from Firestore
            const userDoc = await db.collection('users').doc(userId).get();
            if (!userDoc.exists) {
                console.log(`[WorkItem Check] User ${userId} not found in Firestore`);
                continue;
            }
            
            const userData = userDoc.data();
            let userToken = userData.apsToken;
            
            // Check if token needs refresh
            const tokenExpiry = userData.apsTokenExpiry;
            const now = Date.now();
            
            if (!userToken || !tokenExpiry || now >= tokenExpiry) {
                if (userData.apsRefreshToken) {
                    console.log('[WorkItem Check] Refreshing expired token...');
                    try {
                        const refreshedData = await apsClient.refreshToken(userData.apsRefreshToken);
                        userToken = refreshedData.accessToken;
                        
                        await db.collection('users').doc(userId).update({
                            apsToken: refreshedData.accessToken,
                            apsTokenExpiry: now + (refreshedData.expiresIn * 1000),
                            apsRefreshToken: refreshedData.refreshToken
                        });
                    } catch (refreshError) {
                        console.error('[WorkItem Check] Token refresh failed:', refreshError);
                        continue;
                    }
                } else {
                    console.log(`[WorkItem Check] User ${userId} has no refresh token`);
                    continue;
                }
            }
            
            // Get workitem status from Design Automation API
            try {
                const statusResponse = await axios.get(
                    `https://developer.api.autodesk.com/da/us-east/v3/workitems/${workItemId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${userToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                
                const status = statusResponse.data.status;
                console.log(`[WorkItem Check] WorkItem ${workItemId} status: ${status}`);
                
                if (status === 'success' || status === 'failed' || status === 'cancelled') {
                    // Update log with final status
                    const isRCM = logData.isRCM || false;
                    let finalMessage;
                    let finalStatus;
                    
                    if (status === 'success') {
                        finalStatus = 'success';
                        finalMessage = isRCM 
                            ? 'RCM file published successfully via Design Automation'
                            : 'C4R file published successfully';
                    } else {
                        finalStatus = 'error';
                        finalMessage = isRCM 
                            ? 'RCM files require Cloud Models for Revit access. This user may not have the required permissions to publish RCM files via Design Automation.'
                            : `WorkItem ${status}: Publishing failed. Check Design Automation logs for details.`;
                    }
                    
                    await logDoc.ref.update({
                        status: finalStatus,
                        workItemStatus: status,
                        message: finalMessage,
                        error: finalStatus === 'error' ? finalMessage : null,
                        completedTime: new Date().toISOString(),
                        reportUrl: statusResponse.data.reportUrl || null
                    });
                    
                    console.log(`[WorkItem Check] Updated log for workitem ${workItemId} with status ${status}`);
                    updatedCount++;
                }
            } catch (statusError) {
                console.error(`[WorkItem Check] Error checking status for workitem ${workItemId}:`, statusError.message);
                // Don't update log - will retry on next run
            }
        }
        
        console.log(`[WorkItem Check] Checked ${pendingLogsSnapshot.docs.length} logs, updated ${updatedCount}`);
        res.json({ checked: pendingLogsSnapshot.docs.length, updated: updatedCount });
        
    } catch (error) {
        console.error('[WorkItem Check] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Manually update specific pending logs (for development/testing)
 */
router.post('/update-pending-dev', async (req, res) => {
    try {
        const db = admin.firestore();
        
        // Get all pending logs
        const pendingLogsSnapshot = await db.collection('publishingLogs')
            .where('status', '==', 'pending')
            .get();
        
        if (pendingLogsSnapshot.empty) {
            return res.json({ message: 'No pending logs found', updated: 0 });
        }
        
        let updatedCount = 0;
        
        for (const logDoc of pendingLogsSnapshot.docs) {
            const logData = logDoc.data();
            const isRCM = logData.isRCM || false;
            const isC4R = logData.isC4R || false;
            
            // Assume RCM files failed, C4R files succeeded
            let finalStatus, finalMessage;
            
            if (isRCM) {
                finalStatus = 'error';
                finalMessage = 'RCM files require Cloud Models for Revit access. This user may not have the required permissions to publish RCM files via Design Automation.';
            } else if (isC4R) {
                finalStatus = 'success';
                finalMessage = 'C4R file published successfully';
            } else {
                finalStatus = 'error';
                finalMessage = 'Publishing status unknown';
            }
            
            await logDoc.ref.update({
                status: finalStatus,
                message: finalMessage,
                error: finalStatus === 'error' ? finalMessage : null,
                completedTime: new Date().toISOString()
            });
            
            updatedCount++;
            console.log(`[Dev Update] Updated log ${logDoc.id} to ${finalStatus}`);
        }
        
        res.json({ message: `Updated ${updatedCount} logs`, updated: updatedCount });
        
    } catch (error) {
        console.error('[Dev Update] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
