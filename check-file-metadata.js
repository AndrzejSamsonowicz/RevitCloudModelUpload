/**
 * Check File Metadata - Inspect Revit file version attributes to find version info
 * Usage: node check-file-metadata.js <versionId> <projectId>
 * Example: node check-file-metadata.js "urn:adsk.wipprod:fs.file:vf.xxx?version=1" "b.xxx"
 */

const axios = require('axios');
require('dotenv').config();

const clientId = process.env.APS_CLIENT_ID;
const clientSecret = process.env.APS_CLIENT_SECRET;

async function getToken() {
    const response = await axios.post(
        'https://developer.api.autodesk.com/authentication/v2/token',
        new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
            scope: 'data:read'
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
}

async function checkFileMetadata(versionId, projectId) {
    try {
        const token = await getToken();
        
        console.log('Fetching version metadata...');
        console.log('Version ID:', versionId);
        console.log('Project ID:', projectId);
        console.log('');
        
        const response = await axios.get(
            `https://developer.api.autodesk.com/data/v1/projects/${projectId}/versions/${encodeURIComponent(versionId)}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        const version = response.data.data;
        const attributes = version.attributes;
        const extension = attributes.extension;
        
        console.log('=== FILE METADATA ===');
        console.log('Name:', attributes.displayName || attributes.name);
        console.log('Version Number:', attributes.versionNumber);
        console.log('File Type:', attributes.fileType);
        console.log('');
        
        console.log('=== EXTENSION DATA ===');
        console.log('Extension Type:', extension.type);
        console.log('Extension Version:', extension.version);
        console.log('');
        
        console.log('=== EXTENSION.DATA ===');
        console.log(JSON.stringify(extension.data, null, 2));
        console.log('');
        
        // Check for Revit version hints
        console.log('=== SEARCHING FOR REVIT VERSION ===');
        const dataString = JSON.stringify(extension.data);
        
        const possibleVersionFields = [
            'revitVersion',
            'sourceFileVersion', 
            'applicationVersion',
            'fileVersion',
            'format',
            'formatVersion'
        ];
        
        let foundVersion = false;
        possibleVersionFields.forEach(field => {
            if (extension.data && extension.data[field]) {
                console.log(`✓ Found: ${field} = ${extension.data[field]}`);
                foundVersion = true;
            }
        });
        
        if (!foundVersion) {
            console.log('✗ No Revit version field found in extension.data');
            console.log('');
            console.log('Available fields in extension.data:');
            if (extension.data) {
                Object.keys(extension.data).forEach(key => {
                    console.log(`  - ${key}: ${typeof extension.data[key]}`);
                });
            }
        }
        
        console.log('');
        console.log('=== FULL ATTRIBUTES OBJECT ===');
        console.log(JSON.stringify(attributes, null, 2));
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// Get command line arguments
const versionId = process.argv[2];
const projectId = process.argv[3];

if (!versionId || !projectId) {
    console.log('Usage: node check-file-metadata.js <versionId> <projectId>');
    console.log('');
    console.log('Example:');
    console.log('  node check-file-metadata.js "urn:adsk.wipprod:fs.file:vf.xxx?version=1" "b.xxx"');
    console.log('');
    console.log('To get these IDs:');
    console.log('  1. Log in to the app');
    console.log('  2. Browse to a Revit file');
    console.log('  3. Check network tab or server logs for file version ID and project ID');
    process.exit(1);
}

checkFileMetadata(versionId, projectId);
