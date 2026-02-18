const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const designAutomation = require('../services/designAutomation');
const authRoutes = require('./auth');
const axios = require('axios');
const apsClient = require('../services/apsClient');

const upload = multer({ dest: 'tmp/' });

/**
 * Set Design Automation nickname
 */
router.post('/setup/nickname', async (req, res, next) => {
    try {
        const { nickname } = req.body;
        
        if (!nickname) {
            return res.status(400).json({ error: 'Nickname is required' });
        }

        const result = await designAutomation.setNickname(nickname);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

/**
 * Upload AppBundle (manual file upload)
 */
router.post('/appbundle/upload', upload.single('bundle'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'AppBundle .zip file is required' });
        }

        const engineVersion = req.body.engineVersion || '2024';
        const result = await designAutomation.uploadAppBundle(req.file.path, engineVersion);
        
        res.json({ 
            success: true, 
            data: result,
            message: 'AppBundle uploaded successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Auto-upload AppBundle from server's RevitAppBundle folder
 */
router.post('/appbundle/auto-upload', async (req, res, next) => {
    try {
        const engineVersion = req.body.engineVersion || '2024';
        const bundlePath = path.join(__dirname, '..', 'RevitAppBundle', 'RevitCloudPublisher.zip');
        
        if (!fs.existsSync(bundlePath)) {
            return res.status(404).json({ 
                error: 'RevitCloudPublisher.zip not found. Please build the AppBundle first using build-appbundle.ps1',
                path: bundlePath
            });
        }

        const result = await designAutomation.uploadAppBundle(bundlePath, engineVersion);
        
        res.json({ 
            success: true, 
            data: result,
            message: 'AppBundle uploaded successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Create/Update Activity
 */
router.post('/activity/create', async (req, res, next) => {
    try {
        const engineVersion = req.body.engineVersion || '2024';
        const result = await designAutomation.createActivity(engineVersion);
        
        res.json({ 
            success: true, 
            data: result,
            message: 'Activity created successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Create WorkItem to publish cloud model
 */
router.post('/workitem/create', async (req, res, next) => {
    try {
        const { sessionId, region, projectGuid, modelGuid, revitVersion } = req.body;

        if (!sessionId || !region || !projectGuid || !modelGuid) {
            return res.status(400).json({ 
                error: 'Missing required parameters: sessionId, region, projectGuid, modelGuid' 
            });
        }

        // Get user's 3-legged token
        const userToken = authRoutes.getUserToken(sessionId);
        if (!userToken) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const callbackUrl = process.env.WEBHOOK_URL || `http://localhost:${process.env.PORT || 3000}/webhooks/design-automation`;

        const result = await designAutomation.createWorkItem(
            { region, projectGuid, modelGuid },
            userToken,
            callbackUrl,
            revitVersion || '2026'
        );

        res.json({ 
            success: true, 
            data: result,
            message: 'WorkItem created. Check webhook for completion.'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get WorkItem status
 */
router.get('/workitem/:workItemId/status', async (req, res, next) => {
    try {
        const result = await designAutomation.getWorkItemStatus(req.params.workItemId);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

/**
 * Check status of multiple WorkItems (batch)
 */
router.post('/workitems/batch-status', async (req, res, next) => {
    try {
        const { workItems, sessionId } = req.body; // Array of { workItemId, fileName }
        
        if (!workItems || !Array.isArray(workItems)) {
            return res.status(400).json({ error: 'workItems array is required' });
        }

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        // Verify user session exists (but we'll use 2-legged token for DA API)
        const userToken = authRoutes.getUserToken(sessionId);
        if (!userToken) {
            return res.status(401).json({ error: 'Session expired. Please login again.' });
        }

        // Get 2-legged token for Design Automation API
        const appToken = await apsClient.get2LeggedToken(['code:all']);

        const results = [];

        console.log(`\n📊 Checking status for ${workItems.length} WorkItems...`);

        for (const item of workItems) {
            try {
                console.log(`  Checking WorkItem: ${item.workItemId} (${item.fileName})`);
                
                const response = await axios.get(
                    `https://developer.api.autodesk.com/da/us-east/v3/workitems/${item.workItemId}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${appToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                console.log(`  ✓ Status: ${response.data.status}`);

                results.push({
                    workItemId: item.workItemId,
                    fileName: item.fileName,
                    status: response.data.status,
                    progress: response.data.progress || 'unknown',
                    stats: response.data.stats,
                    reportUrl: response.data.reportUrl
                });
            } catch (error) {
                console.error(`  ✗ Error for ${item.fileName}:`, error.response?.data || error.message);
                
                results.push({
                    workItemId: item.workItemId,
                    fileName: item.fileName,
                    status: 'error',
                    error: error.response?.data || error.message
                });
            }
        }

        console.log(`✓ Status check complete\n`);

        res.json({ success: true, results });
    } catch (error) {
        next(error);
    }
});

/**
 * Scheduled publishing endpoint (called by Cloud Functions)
 */
router.post('/scheduled-publish', async (req, res, next) => {
    try {
        const { userId, fileId, fileName, projectId, projectGuid, modelGuid, region, engineVersion } = req.body;
        
        // Verify the request is from Cloud Functions
        const authHeader = req.headers['x-cloud-function-auth'];
        const expectedAuth = process.env.CLOUD_FUNCTION_AUTH_KEY || 'your-secret-key-here';
        
        if (authHeader !== expectedAuth) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        
        if (!userId || !fileId || !projectGuid || !modelGuid) {
            return res.status(400).json({ 
                error: 'Missing required parameters: userId, fileId, projectGuid, modelGuid' 
            });
        }
        
        console.log(`Scheduled publish triggered for file: ${fileName} (user: ${userId})`);
        
        // Get user's token from Firestore
        const admin = require('firebase-admin');
        const db = admin.firestore();
        
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        let userToken = userData.apsToken;
        
        // Check if token needs refresh
        const tokenExpiry = userData.apsTokenExpiry;
        const now = Date.now();
        
        if (!userToken || !tokenExpiry || now >= tokenExpiry) {
            // Token expired or missing, try to refresh
            if (userData.apsRefreshToken) {
                console.log('Refreshing expired token...');
                try {
                    const refreshedData = await apsClient.refreshToken(userData.apsRefreshToken);
                    userToken = refreshedData.accessToken;
                    
                    // Update token in Firestore
                    await db.collection('users').doc(userId).update({
                        apsToken: refreshedData.accessToken,
                        apsTokenExpiry: now + (refreshedData.expiresIn * 1000),
                        apsRefreshToken: refreshedData.refreshToken
                    });
                    
                    console.log('Token refreshed successfully');
                } catch (refreshError) {
                    console.error('Token refresh failed:', refreshError);
                    return res.status(401).json({ 
                        error: 'Failed to refresh user token. User needs to re-authenticate.'
                    });
                }
            } else {
                return res.status(401).json({ 
                    error: 'User token expired and no refresh token available'
                });
            }
        }
        
        const callbackUrl = process.env.WEBHOOK_URL || `http://localhost:${process.env.PORT || 3000}/webhooks/design-automation`;
        
        // Always use Revit 2026 (newest version, backward compatible with older files)
        const result = await designAutomation.createWorkItem(
            { region: region || 'US', projectGuid, modelGuid },
            userToken,
            callbackUrl,
            '2026' // Safe default: 2026 can open all earlier Revit files
        );
        
        console.log(`WorkItem created for scheduled publish: ${result.workItemId}`);
        
        // Trigger PublishModel to make the model viewable
        // Use the projectId from schedule (already in b.xxx format)
        const projectIdForPublish = projectId || `b.${projectGuid}`;
        
        try {
            console.log(`Triggering PublishModel for ${fileName}...`);
            
            // Get the lineage ID from the file version
            const axios = require('axios');
            const versionResponse = await axios.get(
                `https://developer.api.autodesk.com/data/v1/projects/${projectIdForPublish}/versions/${encodeURIComponent(fileId)}`,
                }
            );
            
            const lineageId = versionResponse.data.data.relationships?.item?.data?.id;
            
            if (lineageId) {
                // Create PublishModel command
                const publishPayload = {
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
                
                const publishResponse = await axios.post(
                    `https://developer.api.autodesk.com/data/v1/projects/${projectIdForPublish}/commands`,
                    publishPayload,
                    {
                        headers: {
                            'Authorization': `Bearer ${userToken}`,
                            'Content-Type': 'application/vnd.api+json'
                        }
                    }
                );
                
                console.log(`✓ PublishModel triggered: ${publishResponse.data.data.id}`);
            }
        } catch (publishError) {
            console.error('PublishModel failed (non-fatal):', publishError.response?.data || publishError.message);
            // Don't fail the whole request if PublishModel fails
        }
        
        res.json({ 
            success: true, 
            data: result,
            message: `Scheduled publish initiated for ${fileName}`
        });
        
    } catch (error) {
        console.error('Scheduled publish error:', error);
        next(error);
    }
});

module.exports = router;
