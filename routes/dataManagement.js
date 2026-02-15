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

        // Get unique item IDs (search returns versions, we need items to get parent folders)
        const itemIds = [...new Set(
            response.data.data
                .map(version => version.relationships?.item?.data?.id)
                .filter(id => id)
        )];

        console.log(`Found ${itemIds.length} unique items`);

        // Fetch item details to get parent folder for each
        const itemFolderMap = {};
        const folderDetailsMap = {};
        
        await Promise.all(
            itemIds.map(async (itemId) => {
                try {
                    // Get item to find parent folder
                    const itemResponse = await axios.get(
                        `https://developer.api.autodesk.com/data/v1/projects/${projectId}/items/${encodeURIComponent(itemId)}`,
                        {
                            headers: { 'Authorization': `Bearer ${req.accessToken}` }
                        }
                    );
                    
                    const parentFolderId = itemResponse.data.data.relationships?.parent?.data?.id;
                    itemFolderMap[itemId] = parentFolderId;
                    
                    // Fetch folder details if we haven't already
                    if (parentFolderId && !folderDetailsMap[parentFolderId]) {
                        try {
                            // Build full path by recursively following parent folders
                            const pathParts = [];
                            let currentFolderId = parentFolderId;
                            const visitedFolders = new Set(); // Prevent infinite loops
                            
                            while (currentFolderId && !visitedFolders.has(currentFolderId)) {
                                visitedFolders.add(currentFolderId);
                                
                                const folderResponse = await axios.get(
                                    `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${encodeURIComponent(currentFolderId)}`,
                                    {
                                        headers: { 'Authorization': `Bearer ${req.accessToken}` }
                                    }
                                );
                                
                                const folderData = folderResponse.data.data;
                                const folderName = folderData.attributes?.displayName || folderData.attributes?.name;
                                
                                if (folderName) {
                                    pathParts.unshift(folderName); // Add to beginning of array
                                }
                                
                                // Get parent folder ID to continue up the hierarchy
                                currentFolderId = folderData.relationships?.parent?.data?.id;
                                
                                // Stop if we reach "Project Files" or a root folder
                                if (folderName === 'Project Files' || !currentFolderId) {
                                    break;
                                }
                            }
                            
                            // Remove "Project Files" from the path if present
                            const filteredParts = pathParts.filter(part => part !== 'Project Files');
                            const folderPath = '/' + filteredParts.join('/');
                            folderDetailsMap[parentFolderId] = folderPath;
                            console.log(`Built path for ${parentFolderId}: ${folderPath}`);
                        } catch (folderError) {
                            console.error(`Error fetching folder ${parentFolderId}:`, folderError.message);
                            folderDetailsMap[parentFolderId] = '/Unknown';
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching item ${itemId}:`, error.message);
                }
            })
        );

        console.log('Folder paths:', folderDetailsMap);

        // Extract relevant file information including cloud model GUIDs and folder paths
        const rvtFiles = response.data.data.map(version => {
            const itemId = version.relationships?.item?.data?.id;
            const parentFolderId = itemFolderMap[itemId];
            const folderPath = parentFolderId ? (folderDetailsMap[parentFolderId] || '/') : '/';
            
            return {
                id: version.id,
                type: version.type,
                name: version.attributes.displayName || version.attributes.name,
                createTime: version.attributes.createTime,
                lastModifiedTime: version.attributes.lastModifiedTime,
                fileType: version.attributes.fileType,
                versionNumber: version.attributes.versionNumber,
                // Extract cloud model data
                extensionType: version.attributes?.extension?.type,
                modelType: version.attributes?.extension?.data?.modelType,
                isCloudModel: version.attributes?.extension?.type?.includes('C4RModel'),
                projectGuid: version.attributes?.extension?.data?.projectGuid,
                modelGuid: version.attributes?.extension?.data?.modelGuid,
                // Folder path from parent folder details
                folderPath: folderPath,
                publishedDate: version.attributes?.extension?.data?.publishedDate || null
            };
        });

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

module.exports = router;
