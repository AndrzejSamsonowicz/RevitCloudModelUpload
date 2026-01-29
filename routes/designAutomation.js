const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const designAutomation = require('../services/designAutomation');
const authRoutes = require('./auth');

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
 * Upload AppBundle
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

module.exports = router;
