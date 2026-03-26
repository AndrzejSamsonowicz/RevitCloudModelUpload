const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const crypto = require('crypto');
const designAutomation = require('../services/designAutomation');
const authRoutes = require('./auth');
const axios = require('axios');
const apsClient = require('../services/apsClient');

// Secure file upload configuration
const upload = multer({
    dest: 'tmp/',
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Only allow .zip files
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.zip') {
            return cb(new Error('Only .zip files are allowed'));
        }
        
        // Validate MIME type
        const allowedMimeTypes = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return cb(new Error('Invalid file type'));
        }
        
        cb(null, true);
    },
    storage: multer.diskStorage({
        destination: 'tmp/',
        filename: (req, file, cb) => {
            // Generate secure random filename
            const uniqueName = crypto.randomBytes(16).toString('hex') + '.zip';
            cb(null, uniqueName);
        }
    })
});

/**
 * Cleanup old uploaded files
 */
async function cleanupOldUploads() {
    try {
        const files = await fsPromises.readdir('tmp/');
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        let cleanedCount = 0;
        
        for (const file of files) {
            const filePath = path.join('tmp/', file);
            try {
                const stats = await fsPromises.stat(filePath);
                
                if (now - stats.mtimeMs > maxAge) {
                    await fsPromises.unlink(filePath);
                    cleanedCount++;
                }
            } catch (error) {
                console.error(`Error processing file ${file}:`, error.message);
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[Upload Cleanup] Deleted ${cleanedCount} old upload(s)`);
        }
    } catch (error) {
        console.error('[Upload Cleanup] Error:', error.message);
    }
}

// Run cleanup every hour
setInterval(cleanupOldUploads, 60 * 60 * 1000);
console.log('✓ Upload cleanup scheduler initialized');

/**
 * Validate nickname input
 */
function validateNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') {
        return { valid: false, error: 'Nickname is required' };
    }
    
    const trimmed = nickname.trim();
    if (trimmed.length < 3 || trimmed.length > 64) {
        return { valid: false, error: 'Nickname must be 3-64 characters' };
    }
    
    // Allow only alphanumeric, underscore, hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return { valid: false, error: 'Nickname can only contain letters, numbers, underscore, and hyphen' };
    }
    
    return { valid: true, value: trimmed };
}

/**
 * Set Design Automation nickname
 */
router.post('/setup/nickname', async (req, res, next) => {
    try {
        const { nickname } = req.body;
        
        const validation = validateNickname(nickname);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }

        const result = await designAutomation.setNickname(validation.value);
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

        // Get user credentials from session
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No authorization token provided' });
        }

        const sessionId = authHeader.replace('Bearer ', '');
        const authRoutes = require('./auth');
        const firebaseUserId = authRoutes.getUserIdFromSession(sessionId);
        
        if (!firebaseUserId) {
            return res.status(401).json({ error: 'User session invalid' });
        }
        
        // Get user's APS credentials from Firestore
        const { decryptUserCredentials } = require('./firebaseAuth');
        const userCredentials = await decryptUserCredentials(firebaseUserId);
        
        if (!userCredentials) {
            return res.status(400).json({ error: 'Please configure your APS credentials in Settings first' });
        }

        console.log(`[Auto-Upload] Uploading AppBundle for user (Client ID: ${userCredentials.clientId?.substring(0, 10)}...)`);

        const result = await designAutomation.uploadAppBundle(bundlePath, engineVersion, userCredentials);
        
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
 * Create Activities for all Revit versions (2024, 2025, 2026)
 */
router.post('/activities/create-all', async (req, res, next) => {
    try {
        const versions = ['2024', '2025', '2026'];
        const results = [];
        
        console.log('Creating Activities for all Revit versions...');
        
        for (const version of versions) {
            try {
                console.log(`  Creating Activity for Revit ${version}...`);
                const result = await designAutomation.createActivity(version);
                results.push({
                    version,
                    success: true,
                    activityId: result.id,
                    message: `Activity for Revit ${version} created/updated successfully`
                });
                console.log(`  ✓ Revit ${version} Activity created`);
            } catch (error) {
                console.error(`  ✗ Failed to create Activity for Revit ${version}:`, error.message);
                results.push({
                    version,
                    success: false,
                    error: error.message
                });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        
        res.json({
            success: successCount > 0,
            results,
            message: `Created ${successCount} of ${versions.length} Activities`,
            summary: {
                total: versions.length,
                created: successCount,
                failed: versions.length - successCount
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Check which Activities exist for current user
 */
router.get('/activities/check', async (req, res, next) => {
    try {
        const { sessionId } = req.query;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }
        
        // Get user's token
        const userToken = authRoutes.getUserToken(sessionId);
        if (!userToken) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        
        // Get 2-legged token for Design Automation API
        const credentials = authRoutes.getUserCredentials(sessionId);
        const appToken = await apsClient.get2LeggedToken(
            credentials?.clientId, 
            credentials?.clientSecret
        );
        
        // Get nickname
        const nicknameResponse = await axios.get(
            'https://developer.api.autodesk.com/da/us-east/v3/forgeapps/me',
            { headers: { 'Authorization': `Bearer ${appToken}` } }
        );
        const nickname = nicknameResponse.data;
        
        // Check for each Revit version
        const versions = ['2024', '2025', '2026'];
        const activityStatus = {};
        
        for (const version of versions) {
            const activityId = `${nickname}.PublishCloudModelActivity+${version}`;
            
            try {
                await axios.get(
                    `https://developer.api.autodesk.com/da/us-east/v3/activities/${activityId}`,
                    { headers: { 'Authorization': `Bearer ${appToken}` } }
                );
                activityStatus[version] = { exists: true, activityId };
            } catch (error) {
                if (error.response?.status === 404) {
                    activityStatus[version] = { exists: false, activityId };
                } else {
                    activityStatus[version] = { exists: false, error: error.message };
                }
            }
        }
        
        const existingCount = Object.values(activityStatus).filter(s => s.exists).length;
        const missingVersions = Object.keys(activityStatus).filter(v => !activityStatus[v].exists);
        
        res.json({
            success: true,
            nickname,
            activities: activityStatus,
            summary: {
                total: versions.length,
                existing: existingCount,
                missing: versions.length - existingCount,
                missingVersions
            },
            recommendation: missingVersions.length > 0 
                ? `Create Activities for Revit ${missingVersions.join(', ')} to support files from these versions`
                : 'All Revit versions (2024-2026) are supported'
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
        // Check if error is related to missing Activity
        if (error.response?.status === 400 || error.response?.status === 404) {
            const errorMessage = error.response?.data?.detail || error.response?.data || error.message;
            
            // Check if it's an Activity not found error
            if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('activity')) {
                const version = revitVersion || '2026';
                return next(new Error(
                    `Activity for Revit ${version} not found. Please create Activities in Settings → Design Automation Setup.`
                ));
            }
        }
        
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
        
        console.log('[Scheduled Publish] Request received from Cloud Function');
        console.log('[Scheduled Publish] Body:', { userId, fileId, fileName, projectId });
        
        // Verify the request is from Cloud Functions
        const authHeader = req.headers['x-cloud-function-auth'];
        const expectedAuth = process.env.CLOUD_FUNCTION_AUTH_KEY || 'your-secret-key-here';
        
        console.log('[Scheduled Publish] Auth header present:', !!authHeader);
        console.log('[Scheduled Publish] Expected auth configured:', expectedAuth !== 'your-secret-key-here');
        
        if (!authHeader) {
            console.error('[Scheduled Publish] No auth header provided');
            return res.status(401).json({ error: 'Unauthorized: No auth header' });
        }
        
        if (authHeader !== expectedAuth) {
            console.error('[Scheduled Publish] Auth header mismatch');
            console.error('[Scheduled Publish] Expected key configured:', expectedAuth !== 'your-secret-key-here');
            return res.status(401).json({ error: 'Unauthorized: Invalid auth key' });
        }
        
        console.log('[Scheduled Publish] Authentication successful');
        
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
        
        // Start polling this WorkItem for status updates
        if (global.workItemPoller) {
            // Find the Firestore log ID for this workItem 
            const logsSnapshot = await db.collection('publishingLogs')
                .where('workItemId', '==', result.workItemId)
                .limit(1)
                .get();
            
            let logId = null;
            if (!logsSnapshot.empty) {
                logId = logsSnapshot.docs[0].id;
            }
            
            global.workItemPoller.track(result.workItemId, logId, fileName);
            console.log(`✓ WorkItem ${result.workItemId} added to poller`);
        }
        
        // Trigger PublishModel to make the model viewable
        // Use the projectId from schedule (already in b.xxx format)
        const projectIdForPublish = projectId || `b.${projectGuid}`;
        
        try {
            console.log(`Triggering PublishModel for ${fileName}...`);
            
            // Get the lineage ID from the file version
            const axios = require('axios');
            const versionResponse = await axios.get(
                `https://developer.api.autodesk.com/data/v1/projects/${projectIdForPublish}/versions/${encodeURIComponent(fileId)}`,
                {
                    headers: {
                        Authorization: `Bearer ${userToken}`
                    }
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
        
        // Check if error is related to missing Activity
        if (error.response?.status === 400 || error.response?.status === 404) {
            const errorMessage = error.response?.data?.detail || error.response?.data || error.message;
            
            // Check if it's an Activity not found error
            if (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes('activity')) {
                return next(new Error(
                    `Activity for Revit 2026 not found. Please create Activities in Settings → Design Automation Setup.`
                ));
            }
        }
        
        next(error);
    }
});

/**
 * Detect Revit file version using BasicFileInfo AppBundle
 * This creates a WorkItem that extracts the file version without opening it
 */
router.post('/detect-version', async (req, res, next) => {
    try {
        const { itemId, projectId, fileName } = req.body;
        
        if (!itemId || !projectId || !fileName) {
            return res.status(400).json({ 
                error: 'Missing required parameters: itemId, projectId, fileName' 
            });
        }

        // Get user credentials
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No authorization token provided' });
        }

        const sessionId = authHeader.replace('Bearer ', '');
        const firebaseUserId = authRoutes.getUserIdFromSession(sessionId);
        
        if (!firebaseUserId) {
            return res.status(401).json({ error: 'User session invalid' });
        }
        
        const { decryptUserCredentials } = require('./firebaseAuth');
        const userCredentials = await decryptUserCredentials(firebaseUserId);
        
        if (!userCredentials) {
            return res.status(400).json({ 
                error: 'Please configure your APS credentials in Settings first' 
            });
        }

        console.log(`[Version Detection] Detecting version for file: ${fileName}`);

        // Create WorkItem for version detection
        const result = await designAutomation.detectFileVersion(
            itemId, 
            projectId, 
            fileName,
            userCredentials
        );

        res.json({ 
            success: true, 
            data: result,
            message: 'Version detection WorkItem created'
        });
    } catch (error) {
        console.error('[Version Detection Error]:', error);
        next(error);
    }
});

/**
 * Detect versions for multiple Revit files in batch
 * Creates WorkItems in parallel for faster processing
 */
router.post('/detect-versions-batch', async (req, res, next) => {
    try {
        const { files } = req.body;
        
        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({ 
                error: 'Missing required parameter: files (array)' 
            });
        }

        // Get user credentials
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No authorization token provided' });
        }

        const sessionId = authHeader.replace('Bearer ', '');
        const firebaseUserId = authRoutes.getUserIdFromSession(sessionId);
        
        if (!firebaseUserId) {
            return res.status(401).json({ error: 'User session invalid' });
        }
        
        const { decryptUserCredentials } = require('./firebaseAuth');
        const userCredentials = await decryptUserCredentials(firebaseUserId);
        
        if (!userCredentials) {
            return res.status(400).json({ 
                error: 'Please configure your APS credentials in Settings first' 
            });
        }

        console.log(`[Batch Version Detection] Detecting versions for ${files.length} files`);

        // Create WorkItems for all files in parallel (max 10 at a time)
        const results = [];
        const maxParallel = 10;
        
        for (let i = 0; i < files.length; i += maxParallel) {
            const batch = files.slice(i, i + maxParallel);
            
            const batchPromises = batch.map(async (file) => {
                try {
                    const result = await designAutomation.detectFileVersion(
                        file.itemId,
                        file.projectId,
                        file.fileName,
                        userCredentials
                    );
                    return {
                        itemId: file.itemId,
                        fileName: file.fileName,
                        success: true,
                        workItemId: result.workItemId
                    };
                } catch (error) {
                    console.error(`Failed to detect version for ${file.fileName}:`, error.message);
                    return {
                        itemId: file.itemId,
                        fileName: file.fileName,
                        success: false,
                        error: error.message
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        const successCount = results.filter(r => r.success).length;
        console.log(`[Batch Version Detection] Created ${successCount}/${files.length} WorkItems`);

        res.json({ 
            success: true, 
            results,
            summary: {
                total: files.length,
                successful: successCount,
                failed: files.length - successCount
            },
            message: `Version detection started for ${successCount} files`
        });
    } catch (error) {
        console.error('[Batch Version Detection Error]:', error);
        next(error);
    }
});

/**
 * Get version detection result for a WorkItem
 */
router.get('/version-result/:workItemId', async (req, res, next) => {
    try {
        const { workItemId } = req.params;
        
        if (!workItemId) {
            return res.status(400).json({ error: 'WorkItem ID is required' });
        }

        // Get user credentials
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No authorization token provided' });
        }

        const sessionId = authHeader.replace('Bearer ', '');
        const firebaseUserId = authRoutes.getUserIdFromSession(sessionId);
        
        if (!firebaseUserId) {
            return res.status(401).json({ error: 'User session invalid' });
        }
        
        const { decryptUserCredentials } = require('./firebaseAuth');
        const userCredentials = await decryptUserCredentials(firebaseUserId);
        
        if (!userCredentials) {
            return res.status(400).json({ 
                error: 'Please configure your APS credentials in Settings first' 
            });
        }

        const result = await designAutomation.getVersionDetectionResult(workItemId, userCredentials);

        res.json({ 
            success: true, 
            data: result
        });
    } catch (error) {
        console.error('[Get Version Result Error]:', error);
        next(error);
    }
});

module.exports = router;
