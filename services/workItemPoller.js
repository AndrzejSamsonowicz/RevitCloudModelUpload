/**
 * WorkItem Status Poller
 * Polls Design Automation WorkItems and updates Firestore when they complete
 */

const axios = require('axios');
const admin = require('firebase-admin');
const { getWorkitemMetadata, triggerPublishModel } = require('../routes/webhooks');

class WorkItemPoller {
    constructor(designAutomationService) {
        this.da = designAutomationService;
        this.activeWorkItems = new Map(); // workItemId -> { logId, startTime, fileName }
        this.pollInterval = 10000; // Poll every 10 seconds
        this.maxAge = 30 * 60 * 1000; // Stop polling after 30 minutes
        this.isRunning = false;
    }

    /**
     * Start polling a WorkItem
     */
    track(workItemId, logId, fileName) {
        console.log(`[WorkItemPoller] Tracking WorkItem ${workItemId} for ${fileName}`);
        this.activeWorkItems.set(workItemId, {
            logId,
            fileName,
            startTime: Date.now()
        });
        
        // Start the poller if not already running
        if (!this.isRunning) {
            this.start();
        }
    }

    /**
     * Start the polling loop
     */
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('[WorkItemPoller] Started');
        
        this.intervalId = setInterval(async () => {
            await this.pollAll();
        }, this.pollInterval);
    }

    /**
     * Stop the polling loop
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('[WorkItemPoller] Stopped');
    }

    /**
     * Poll all active WorkItems
     */
    async pollAll() {
        if (this.activeWorkItems.size === 0) {
            this.stop();
            return;
        }

        const now = Date.now();
        const workItemIds = Array.from(this.activeWorkItems.keys());

        console.log(`[WorkItemPoller] Polling ${workItemIds.length} WorkItems...`);

        for (const workItemId of workItemIds) {
            const info = this.activeWorkItems.get(workItemId);
            
            // Skip if already removed by another process
            if (!info) {
                continue;
            }
            
            const age = now - info.startTime;

            // Stop tracking if too old
            if (age > this.maxAge) {
                console.log(`[WorkItemPoller] WorkItem ${workItemId} exceeded max age, marking as timeout`);
                await this.updateFirestore(workItemId, info.logId, 'error', 'WorkItem timed out after 30 minutes');
                this.activeWorkItems.delete(workItemId);
                continue;
            }

            try {
                const status = await this.da.getWorkItemStatus(workItemId);
                
                console.log(`[WorkItemPoller] WorkItem ${workItemId}: ${status.status}`);

                if (status.status === 'success' || status.status === 'failed' || 
                    status.status === 'cancelled' || status.status === 'failedInstructions' ||
                    status.status === 'failedDownload' || status.status === 'failedUpload') {
                    // WorkItem completed - update Firestore and stop tracking (deletion happens in onWorkItemComplete)
                    await this.onWorkItemComplete(workItemId, info, status);
                }
            } catch (error) {
                console.error(`[WorkItemPoller] Error polling WorkItem ${workItemId}:`, error.message);
                
                // If 404, WorkItem doesn't exist - remove from tracking
                if (error.response?.status === 404) {
                    this.activeWorkItems.delete(workItemId);
                }
            }
        }
        
        // Stop poller if no items left after cleanup
        if (this.activeWorkItems.size === 0) {
            console.log('[WorkItemPoller] No active items remaining, stopping poller');
            this.stop();
        }
    }

    /**
     * Handle WorkItem completion
     */
    async onWorkItemComplete(workItemId, info, status) {
        console.log(`[WorkItemPoller] WorkItem ${workItemId} completed with status: ${status.status}`);
        
        let finalStatus;
        let finalMessage;

        if (status.status === 'success') {
            finalStatus = 'success';
            finalMessage = `Published successfully via Design Automation`;
        } else if (status.status === 'failedInstructions') {
            finalStatus = 'error';
            finalMessage = `Publish failed: disabled service i.e.: Cloud Models for Revit, or the file is corrupted`;
        } else {
            finalStatus = 'error';
            finalMessage = `WorkItem ${status.status}. Check Design Automation logs for details.`;
        }

        await this.updateFirestore(workItemId, info.logId, finalStatus, finalMessage, status.reportUrl);
        
        // Remove from active tracking immediately to prevent re-processing
        this.activeWorkItems.delete(workItemId);
        
        // Trigger PublishModel if WorkItem succeeded
        if (status.status === 'success') {
            const metadata = getWorkitemMetadata(workItemId);
            if (metadata) {
                console.log(`[WorkItemPoller] Triggering PublishModel for WorkItem ${workItemId}`);
                await triggerPublishModel(workItemId, metadata);
            }
        }
    }

    /**
     * Update Firestore log entry
     */
    async updateFirestore(workItemId, logId, status, message, reportUrl = null) {
        try {
            const db = admin.firestore();
            
            if (logId) {
                // Update specific log by ID
                await db.collection('publishingLogs').doc(logId).update({
                    status,
                    message,
                    workItemStatus: status === 'success' ? 'success' : 'failed',
                    completedTime: new Date().toISOString(),
                    reportUrl: reportUrl || null
                });
                console.log(`[WorkItemPoller] Updated Firestore log ${logId}`);
            } else {
                // Find log by workItemId
                const logsSnapshot = await db.collection('publishingLogs')
                    .where('workItemId', '==', workItemId)
                    .limit(1)
                    .get();

                if (!logsSnapshot.empty) {
                    const logDoc = logsSnapshot.docs[0];
                    await logDoc.ref.update({
                        status,
                        message,
                        workItemStatus: status === 'success' ? 'success' : 'failed',
                        completedTime: new Date().toISOString(),
                        reportUrl: reportUrl || null
                    });
                    console.log(`[WorkItemPoller] Updated Firestore log for WorkItem ${workItemId}`);
                } else {
                    console.log(`[WorkItemPoller] No Firestore log found for WorkItem ${workItemId}`);
                }
            }
        } catch (error) {
            console.error(`[WorkItemPoller] Error updating Firestore:`, error);
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeCount: this.activeWorkItems.size,
            activeWorkItems: Array.from(this.activeWorkItems.entries()).map(([id, info]) => ({
                workItemId: id,
                fileName: info.fileName,
                age: Math.round((Date.now() - info.startTime) / 1000) + 's'
            }))
        };
    }
}

module.exports = WorkItemPoller;
