const express = require('express');
const router = express.Router();
const axios = require('axios');
const authRoutes = require('./auth');

// Middleware to extract access token from session
function getAccessToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization token provided' });
    }

    // Extract session ID from "Bearer <sessionId>"
    const sessionId = authHeader.replace('Bearer ', '');
    const accessToken = authRoutes.getUserToken(sessionId);

    if (!accessToken) {
        return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.accessToken = accessToken;
    next();
}

// Get all hubs
router.get('/hubs', getAccessToken, async (req, res) => {
    try {
        const response = await axios.get('https://developer.api.autodesk.com/project/v1/hubs', {
            headers: { 'Authorization': `Bearer ${req.accessToken}` }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching hubs:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || error.message
        });
    }
});

// Get projects in a hub
router.get('/hubs/:hubId/projects', getAccessToken, async (req, res) => {
    try {
        const { hubId } = req.params;
        const response = await axios.get(
            `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects`,
            {
                headers: { 'Authorization': `Bearer ${req.accessToken}` }
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching projects:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || error.message
        });
    }
});

// Get top folders in a project
router.get('/projects/:projectId/topFolders', getAccessToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { hubId } = req.query;

        const response = await axios.get(
            `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`,
            {
                headers: { 'Authorization': `Bearer ${req.accessToken}` }
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error('Error fetching top folders:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || error.message
        });
    }
});

// Search for Revit files (.rvt) in a project folder (recursively)
router.get('/projects/:projectId/folders/:folderId/rvtFiles', getAccessToken, async (req, res) => {
    try {
        const { projectId, folderId } = req.params;
        
        // Use search endpoint to recursively find all .rvt files
        const response = await axios.get(
            `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${encodeURIComponent(folderId)}/search`,
            {
                headers: { 'Authorization': `Bearer ${req.accessToken}` },
                params: {
                    'filter[fileType]': 'rvt'  // Filter for Revit files
                }
            }
        );

        // Extract relevant file information including cloud model GUIDs
        const rvtFiles = response.data.data.map(item => ({
            id: item.id,
            type: item.type,
            name: item.attributes.displayName || item.attributes.name,
            createTime: item.attributes.createTime,
            lastModifiedTime: item.attributes.lastModifiedTime,
            fileType: item.attributes.fileType,
            versionNumber: item.attributes.versionNumber,
            // Extract cloud model data
            extensionType: item.attributes?.extension?.type,
            modelType: item.attributes?.extension?.data?.modelType,
            isCloudModel: item.attributes?.extension?.type?.includes('C4RModel'),
            projectGuid: item.attributes?.extension?.data?.projectGuid,
            modelGuid: item.attributes?.extension?.data?.modelGuid
        }));

        res.json({ files: rvtFiles, total: rvtFiles.length });
    } catch (error) {
        console.error('Error searching Revit files:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || error.message
        });
    }
});

// Publish a workshared cloud model to BIM 360 Docs
// This makes the model viewable/searchable after synchronization
router.post('/publish/:itemId', getAccessToken, async (req, res) => {
    try {
        const { itemId } = req.params;  // This is the file version ID
        const { projectId } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required in request body' });
        }

        console.log('PublishModel request:', { itemId, projectId });

        // Extract the base URN (lineage) by removing version query parameter
        // File version ID: urn:adsk.wipprod:fs.file:vf.xxx?version=8
        // Item lineage ID: urn:adsk.wipprod:dm.lineage:xxx
        let lineageId = itemId;
        
        // If itemId contains version parameter, we need to get the item lineage
        if (itemId.includes('fs.file')) {
            // Get item details to find the lineage
            const versionResponse = await axios.get(
                `https://developer.api.autodesk.com/data/v1/projects/${projectId}/versions/${encodeURIComponent(itemId)}`,
                {
                    headers: { 'Authorization': `Bearer ${req.accessToken}` }
                }
            );
            
            // Get item from version relationships
            const itemLink = versionResponse.data.data.relationships?.item?.data?.id;
            if (itemLink) {
                lineageId = itemLink;
                console.log('Resolved lineage ID:', lineageId);
            }
        }

        // Create PublishModel command
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

        console.log('Publishing model with payload:', JSON.stringify(payload, null, 2));
        const response = await axios.post(
            `https://developer.api.autodesk.com/data/v1/projects/${projectId}/commands`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${req.accessToken}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        console.log('PublishModel response:', response.data);
        res.json({
            success: true,
            commandId: response.data.data.id,
            status: response.data.data.attributes.status,
            message: 'Publish command initiated'
        });
    } catch (error) {
        console.error('Error publishing model:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.errors?.[0]?.detail || error.response?.data || error.message
        });
    }
});

// Get PublishModel job status
router.post('/publish-status/:itemId', getAccessToken, async (req, res) => {
    try {
        const { itemId } = req.params;
        const { projectId } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required in request body' });
        }

        // Create GetPublishModelJob command
        const payload = {
            jsonapi: { version: '1.0' },
            data: {
                type: 'commands',
                attributes: {
                    extension: {
                        type: 'commands:autodesk.bim360:C4RModelGetPublishJob',
                        version: '1.0.0'
                    }
                },
                relationships: {
                    resources: {
                        data: [{ type: 'items', id: itemId }]
                    }
                }
            }
        };

        const response = await axios.post(
            `https://developer.api.autodesk.com/data/v1/projects/${projectId}/commands`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${req.accessToken}`,
                    'Content-Type': 'application/vnd.api+json'
                }
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error('Error getting publish status:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || error.message
        });
    }
});

// Batch check publish status for multiple files
router.post('/batch-publish-status', getAccessToken, async (req, res) => {
    try {
        const { files, projectId } = req.body;

        if (!projectId || !files || !Array.isArray(files)) {
            return res.status(400).json({ error: 'projectId and files array are required' });
        }

        const results = [];

        for (const file of files) {
            try {
                // Check if it's a cloud model
                if (!file.isCloudModel) {
                    results.push({
                        itemId: file.itemId,
                        fileName: file.fileName,
                        needsPublishing: null,
                        status: 'not_cloud_model',
                        modelType: 'Not a Revit Cloud Model'
                    });
                    continue;
                }

                // Use new RCM API to get publish status
                // Extract versionId from itemId (it's actually the version ID)
                const versionId = file.itemId;
                
                const response = await axios.get(
                    `https://developer.api.autodesk.com/construction/rcm/v1/projects/${projectId}/published-versions/${encodeURIComponent(versionId)}/linked-files`,
                    {
                        headers: { 'Authorization': `Bearer ${req.accessToken}` }
                    }
                );

                // Check host file publish status
                const hostFile = response.data.hostFile;
                const isPublished = hostFile?.publishStatus === 'Published';
                const modelType = file.modelType || 'unknown';

                results.push({
                    itemId: file.itemId,
                    fileName: file.fileName,
                    needsPublishing: !isPublished,
                    status: isPublished ? 'published' : 'needs_publishing',
                    modelType: modelType === 'multiuser' ? 'Cloud Workshared (C4R)' : modelType === 'singleuser' ? 'Single-user Cloud Model' : modelType,
                    publishStatus: hostFile?.publishStatus,
                    size: hostFile?.size
                });
            } catch (error) {
                // Handle errors (suppress logging for expected "old file" errors)
                const errorTitle = error.response?.data?.title || '';
                const errorDetail = error.response?.data?.detail || error.message;
                
                if (errorTitle !== 'NotFound' && errorTitle !== 'Forbidden') {
                    console.error(`Error checking status for ${file.fileName}:`, error.response?.data || error.message);
                }
                
                const is404 = error.response?.status === 404 || errorTitle === 'NotFound';
                const isForbidden = error.response?.status === 403 || errorTitle === 'Forbidden';
                
                let status = 'unknown';
                let errorMessage = errorDetail;
                
                if (is404 && errorDetail?.includes('published before')) {
                    status = 'not_published_yet';
                    errorMessage = 'Published before Feb 7, 2025 (use legacy publish check)';
                } else if (isForbidden && errorDetail?.includes('model copies')) {
                    status = 'unknown';
                    errorMessage = 'Model copy - status check not available';
                } else if (is404) {
                    status = 'not_published_yet';
                    errorMessage = 'Not published or old version';
                }
                
                results.push({
                    itemId: file.itemId,
                    fileName: file.fileName,
                    needsPublishing: null,
                    status: status,
                    modelType: file.modelType || 'unknown',
                    error: errorMessage
                });
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Error in batch publish status:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

// Check command status by command ID
router.get('/commands/:commandId', getAccessToken, async (req, res) => {
    try {
        const { commandId } = req.params;
        const { projectId } = req.query;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId query parameter is required' });
        }

        console.log('Checking command status:', { commandId, projectId });

        const response = await axios.get(
            `https://developer.api.autodesk.com/data/v1/projects/${projectId}/commands/${commandId}`,
            {
                headers: { 'Authorization': `Bearer ${req.accessToken}` }
            }
        );

        console.log('Command status response:', response.data);
        res.json({
            success: true,
            command: response.data.data
        });
    } catch (error) {
        console.error('Error checking command status:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.errors?.[0]?.detail || error.response?.data || error.message
        });
    }
});

module.exports = router;
