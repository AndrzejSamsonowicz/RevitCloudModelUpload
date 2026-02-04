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

module.exports = router;
