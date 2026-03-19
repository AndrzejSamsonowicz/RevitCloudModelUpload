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
        
        // Browse folder tree recursively to find all .rvt files
        // This approach is more reliable than search API for users with complex permissions
        const folderNameCache = {};
        const allRevitFiles = [];
        const processedFolders = new Set();
        
        async function getAllRvtFilesRecursive(currentFolderId, currentPath = '', depth = 0) {
            if (depth > 10 || processedFolders.has(currentFolderId)) {
                return;
            }
            processedFolders.add(currentFolderId);
            
            try {
                let nextPageUrl = `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${encodeURIComponent(currentFolderId)}/contents`;
                
                const subfolders = [];
                
                // Handle pagination - some folders have many items
                while (nextPageUrl) {
                    const contentsResponse = await axios.get(nextPageUrl, {
                        headers: { 'Authorization': `Bearer ${req.accessToken}` }
                    });
                    
                    // Build a map of version IDs to version data from the included array
                    const includedVersions = {};
                    if (contentsResponse.data.included) {
                        for (const includedItem of contentsResponse.data.included) {
                            if (includedItem.type === 'versions') {
                                includedVersions[includedItem.id] = includedItem;
                            }
                        }
                    }
                    
                    for (const item of contentsResponse.data.data) {
                        if (item.type === 'folders') {
                            // Cache this folder
                            const folderName = item.attributes.displayName || item.attributes.name;
                            const fullPath = currentPath ? `${currentPath}/${folderName}` : `/${folderName}`;
                            folderNameCache[item.id] = fullPath;
                            
                            // Collect subfolder for parallel processing
                            subfolders.push({ id: item.id, path: fullPath });
                        } else if (item.type === 'items') {
                            const displayName = item.attributes?.displayName || item.attributes?.name || 'Unknown';
                            const fileType = item.attributes?.extension?.type;
                            
                            // Check if this is a Revit file (check both name and extension type)
                            const isRvtByName = displayName.toLowerCase().endsWith('.rvt');
                            const isRvtByType = fileType?.toLowerCase().includes('rvt');
                            
                            if (isRvtByName || isRvtByType) {
                                // Get the tip version from the item's relationships and included array
                                const tipVersionId = item.relationships?.tip?.data?.id;
                                const tipVersion = tipVersionId ? includedVersions[tipVersionId] : null;
                                
                                if (tipVersion) {
                                    tipVersion._itemId = item.id;
                                    tipVersion._folderPath = currentPath || '/';
                                    tipVersion._folderId = folderId; // Add folder ID for permission checking
                                    allRevitFiles.push(tipVersion);
                                    console.log(`Found: ${displayName} v${tipVersion.attributes?.versionNumber || '?'} in ${currentPath || '/'}`);
                                }
                            }
                        }
                    }
                    
                    // Check for next page
                    nextPageUrl = contentsResponse.data.links?.next?.href;
                    if (nextPageUrl && !nextPageUrl.startsWith('http')) {
                        nextPageUrl = `https://developer.api.autodesk.com${nextPageUrl}`;
                    }
                }
                
                // Process subfolders in parallel (limit concurrency to 5 to avoid rate limits)
                if (subfolders.length > 0) {
                    const batchSize = 5;
                    for (let i = 0; i < subfolders.length; i += batchSize) {
                        const batch = subfolders.slice(i, i + batchSize);
                        await Promise.all(
                            batch.map(sf => getAllRvtFilesRecursive(sf.id, sf.path, depth + 1))
                        );
                    }
                }
            } catch (error) {
                console.log(`Could not browse folder ${currentFolderId}:`, error.response?.status);
            }
        }
        
        // Get the root folder name first, then browse recursively
        let rootFolderName = '';
        try {
            const rootFolderResponse = await axios.get(
                `https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${encodeURIComponent(folderId)}`,
                {
                    headers: { 'Authorization': `Bearer ${req.accessToken}` }
                }
            );
            rootFolderName = rootFolderResponse.data.data.attributes?.displayName || rootFolderResponse.data.data.attributes?.name || '';
        } catch (error) {
            console.log(`Could not fetch root folder name:`, error.response?.status);
        }
        
        const rootPath = rootFolderName && rootFolderName !== 'Project Files' ? `/${rootFolderName}` : '';
        await getAllRvtFilesRecursive(folderId, rootPath);
        
        console.log(`Recursive browse found ${allRevitFiles.length} Revit files`);
        
        // We already have folder paths from the recursive browse
        // Just format the file information
        const rvtFiles = allRevitFiles.map(version => {
            const folderPath = version._folderPath || '/';
            
            // DEBUG: Log first file's extension data to see available fields
            if (allRevitFiles.indexOf(version) === 0) {
                console.log('=== SAMPLE FILE EXTENSION DATA ===');
                console.log('File:', version.attributes.displayName || version.attributes.name);
                console.log('Extension:', JSON.stringify(version.attributes.extension, null, 2));
            }
            
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
                // Try to extract Revit version from various possible fields
                revitVersion: version.attributes?.extension?.data?.revitVersion || 
                             version.attributes?.extension?.data?.sourceFileVersion ||
                             version.attributes?.extension?.data?.applicationVersion ||
                             version.attributes?.extension?.data?.formatVersion ||
                             version.attributes?.extension?.data?.fileVersion ||
                             version.attributes?.extension?.data?.format ||
                             null,
                // Folder path and folder ID for permission checking
                folderPath: folderPath,
                folderId: version._folderId, // Add folder ID for permission checking
                publishedDate: version.attributes?.extension?.data?.publishedDate || null
            };
        });

        res.json({ files: rvtFiles, total: rvtFiles.length });
    } catch (error) {
        console.error('Error browsing Revit files:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || error.message
        });
    }
});

// Publish a cloud model - handles both single-user and workshared models
// ✅ VERIFIED WORKING: March 15, 2026
// This is the CORRECT approach - just call C4RModelPublish API directly
// See: WORKING_SOLUTION_PUBLISH_RCM.md for full documentation
router.post('/publish/:itemId', getAccessToken, async (req, res) => {
    try {
        const { itemId } = req.params;
        const { projectId, projectGuid, modelGuid, fileName, region } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required in request body' });
        }

        console.log('Manual publish request:', { itemId, projectId, projectGuid, modelGuid, fileName, region });

        // For single-user RCM files: Just call PublishModel API directly
        // The files already have unpublished changes from manual edits
        // No need for WorkItem if we're just publishing existing changes
        console.log('✓ Publishing existing unpublished changes to create new version');

        // Extract the base URN (lineage) and detect model type
        let lineageId = itemId;
        let modelType = null;
        
        if (itemId.includes('fs.file')) {
            const versionResponse = await axios.get(
                `https://developer.api.autodesk.com/data/v1/projects/${projectId}/versions/${encodeURIComponent(itemId)}`,
                {
                    headers: { 'Authorization': `Bearer ${req.accessToken}` }
                }
            );
            
            const itemLink = versionResponse.data.data.relationships?.item?.data?.id;
            if (itemLink) {
                lineageId = itemLink;
                console.log('  Resolved lineage ID:', lineageId);
            }
            
            modelType = versionResponse.data.data.attributes?.extension?.data?.modelType;
        }
        
        console.log(`  Model type: ${modelType || 'unknown'}`);
        
        // Use C4RModelPublish for all Revit cloud models (both single-user and workshared)
        const publishCommandType = 'commands:autodesk.bim360:C4RModelPublish';
        console.log(`✓ Using ${publishCommandType}`);

        // Create PublishModel command
        const payload = {
            jsonapi: { version: '1.0' },
            data: {
                type: 'commands',
                attributes: {
                    extension: {
                        type: publishCommandType,
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

        res.json({
            success: true,
            commandId: response.data.data.id,
            status: response.data.data.attributes.status,
            message: 'Publish command initiated'
        });
    } catch (error) {
        console.error('Error publishing model:', error.response?.data || error.message);
        
        // Enhanced error response with full details
        const errorDetail = error.response?.data?.errors?.[0];
        const errorMessage = errorDetail?.detail || error.response?.data || error.message;
        const errorCode = errorDetail?.code;
        
        // Check for specific error cases
        let userMessage = errorMessage;
        if (error.response?.status === 403) {
            if (errorCode === 'C4R') {
                userMessage = 'No unpublished changes to publish, or insufficient permissions. The file may already be at the latest version.';
            } else {
                userMessage = 'Permission denied. You may not have rights to publish this file.';
            }
        }
        
        res.status(error.response?.status || 500).json({
            error: userMessage,
            details: {
                statusCode: error.response?.status,
                errorCode: errorCode,
                originalError: errorMessage
            }
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

// Check folder permissions for current user
router.get('/projects/:projectId/folders/:folderId/permissions', getAccessToken, async (req, res) => {
    try {
        const { projectId, folderId } = req.params;
        
        // Remove 'b.' prefix from projectId for BIM 360 API
        const bim360ProjectId = projectId.replace(/^b\./, '');
        
        console.log(`Checking permissions for folder ${folderId} in project ${bim360ProjectId}`);
        
        const response = await axios.get(
            `https://developer.api.autodesk.com/bim360/docs/v1/projects/${bim360ProjectId}/folders/${folderId}/permissions`,
            {
                headers: {
                    'Authorization': `Bearer ${req.accessToken}`
                }
            }
        );
        
        res.json(response.data);
    } catch (error) {
        console.error('Error checking folder permissions:', error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data || error.message
        });
    }
});

module.exports = router;
