const express = require('express');
const router = express.Router();
const axios = require('axios');

// Store webhook results (in production, use database)
const webhookResults = new Map();

// Store workitem metadata for PublishModel callback
const workitemMetadata = new Map();

/**
 * Store workitem metadata for PublishModel callback
 */
function storeWorkitemMetadata(workitemId, metadata) {
    workitemMetadata.set(workitemId, metadata);
    console.log(`[Webhook] Stored metadata for WorkItem ${workitemId}`);
}

/**
 * Design Automation webhook callback
 */
router.post('/design-automation', express.json(), async (req, res) => {
    console.log('Design Automation webhook received:', JSON.stringify(req.body, null, 2));

    const { id, status, reportUrl, stats } = req.body;

    // Store result
    webhookResults.set(id, {
        status,
        reportUrl,
        stats,
        timestamp: Date.now(),
        body: req.body
    });

    // Respond immediately (best practice)
    res.status(202).send('OK');

    // Log the result
    console.log(`WorkItem ${id} completed with status: ${status}`);
    if (reportUrl) {
        console.log(`Report URL: ${reportUrl}`);
    }
    
    // Update Firestore log for scheduled publishes
    try {
        const admin = require('firebase-admin');
        const db = admin.firestore();
        
        // Find the log entry with this workItemId
        const logsSnapshot = await db.collection('publishingLogs')
            .where('workItemId', '==', id)
            .limit(1)
            .get();
        
        if (!logsSnapshot.empty) {
            const logDoc = logsSnapshot.docs[0];
            const logData = logDoc.data();
            const isRCM = logData.isRCM || false;
            
            console.log(`[Webhook] Found Firestore log for workitem ${id}, updating status to ${status}`);
            
            // Determine final message based on status and file type
            let finalMessage;
            let finalStatus;
            
            if (status === 'success') {
                finalStatus = 'success';
                if (isRCM) {
                    finalMessage = `RCM file published successfully via Design Automation`;
                } else {
                    finalMessage = `C4R file published successfully`;
                }
            } else {
                finalStatus = 'error';
                if (isRCM) {
                    finalMessage = 'RCM files require Cloud Models for Revit access. This user may not have the required permissions to publish RCM files via Design Automation.';
                } else {
                    finalMessage = `WorkItem ${status}: Publishing failed. Check Design Automation logs for details.`;
                }
            }
            
            // Update the log entry
            await logDoc.ref.update({
                status: finalStatus,
                workItemStatus: status,
                message: finalMessage,
                error: finalStatus === 'error' ? finalMessage : null,
                completedTime: new Date().toISOString(),
                reportUrl: reportUrl || null
            });
            
            console.log(`[Webhook] Updated Firestore log with final status`);
        } else {
            console.log(`[Webhook] No Firestore log found for workitem ${id} (likely a manual publish)`);
        }
    } catch (firestoreError) {
        console.error('[Webhook] Error updating Firestore log:', firestoreError);
        // Don't fail the webhook if Firestore update fails
    }

    // If WorkItem succeeded and we have metadata for publishing, call PublishModel API
    if (status === 'success') {
        const metadata = getWorkitemMetadata(id);
        await triggerPublishModel(id, metadata);
    }
});

/**
 * Get webhook result by WorkItem ID
 */
router.get('/result/:workItemId', (req, res) => {
    const result = webhookResults.get(req.params.workItemId);
    
    if (!result) {
        return res.status(404).json({ error: 'Result not found' });
    }

    res.json({ success: true, data: result });
});

/**
 * Receive result file upload
 */
router.put('/design-automation/result.txt', express.text({ type: '*/*' }), (req, res) => {
    console.log('Result file received:', req.body);
    res.status(200).send('OK');
});

/**
 * Get workitem metadata
 */
function getWorkitemMetadata(workitemId) {
    return workitemMetadata.get(workitemId);
}

/**
 * Delete workitem metadata
 */
function deleteWorkitemMetadata(workitemId) {
    workitemMetadata.delete(workitemId);
}

/**
 * Trigger PublishModel for a completed WorkItem
 * Can be called by webhook or poller
 */
async function triggerPublishModel(workitemId, metadata) {
    if (!metadata || !metadata.shouldPublish) {
        console.log(`[PublishModel] No publish metadata found for WorkItem ${workitemId}`);
        return false;
    }

    console.log(`[PublishModel] WorkItem succeeded - calling PublishModel API for file ${metadata.itemId}`);
    
    try {
        // Extract lineage ID from itemId if needed
        let lineageId = metadata.itemId;
        if (metadata.itemId.includes('fs.file')) {
            console.log('[PublishModel] Item is a version, fetching lineage ID...');
            const versionResponse = await axios.get(
                `https://developer.api.autodesk.com/data/v1/projects/${metadata.projectId}/versions/${encodeURIComponent(metadata.itemId)}`,
                { headers: { 'Authorization': `Bearer ${metadata.userToken}` } }
            );
            const itemLink = versionResponse.data.data.relationships?.item?.data?.id;
            if (itemLink) {
                lineageId = itemLink;
                console.log(`[PublishModel] Lineage ID: ${lineageId}`);
            } else {
                console.log('[PublishModel] Warning: Could not extract lineage ID, using itemId directly');
            }
        }

        // Prepare PublishModel command payload
        const payload = {
            jsonapi: { version: '1.0' },
            data: {
                type: 'commands',
                attributes: {
                    extension: {
                        type: 'commands:autodesk.bim360:C4RModelPublish',
                        version: '1.0.0'
                    }
                },
                relationships: {
                    resources: {
                        data: [{ type: 'items', id: lineageId }]
                    }
                }
            }
        };

        console.log('[PublishModel] Calling PublishModel API...');
        const publishResponse = await axios.post(
            `https://developer.api.autodesk.com/data/v1/projects/${metadata.projectId}/commands`,
            payload,
            { 
                headers: { 
                    'Authorization': `Bearer ${metadata.userToken}`,
                    'Content-Type': 'application/vnd.api+json'
                } 
            }
        );

        console.log(`[PublishModel] ✓ PublishModel command initiated: ${publishResponse.data.data?.id}`);
        console.log(`[PublishModel] Command status: ${publishResponse.data.data?.attributes?.status}`);
        
        // "committed" status means the publish command was accepted and will be processed
        // No need to poll - the publish happens asynchronously in ACC
        if (publishResponse.data.data?.attributes?.status === 'committed') {
            console.log('[PublishModel] ✓✓✓ PublishModel command committed - new version will be created in ACC');
        }

        // Clean up metadata
        deleteWorkitemMetadata(workitemId);
        return true;
        
    } catch (err) {
        console.error('[PublishModel] ✗ Failed to publish model:', err.response?.data || err.message);
        if (err.response) {
            console.error('[PublishModel] Error details:', JSON.stringify(err.response.data, null, 2));
        }
        return false;
    }
}

module.exports = router;
module.exports.storeWorkitemMetadata = storeWorkitemMetadata;
module.exports.getWorkitemMetadata = getWorkitemMetadata;
module.exports.deleteWorkitemMetadata = deleteWorkitemMetadata;
module.exports.triggerPublishModel = triggerPublishModel;
