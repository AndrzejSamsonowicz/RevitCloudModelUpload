const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const apsClient = require('./apsClient');

const DESIGN_AUTOMATION_BASE = 'https://developer.api.autodesk.com/da/us-east/v3';

class DesignAutomationService {
    constructor() {
        this.nickname = process.env.DESIGN_AUTOMATION_NICKNAME;
        this.activityName = process.env.ACTIVITY_NAME || 'PublishCloudModelActivity';
        this.appBundleName = process.env.APPBUNDLE_NAME || 'RevitCloudPublisher';
    }

    async getHeaders() {
        const token = await apsClient.get2LeggedToken(['code:all']);
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Set Design Automation nickname (one-time setup)
     */
    async setNickname(nickname) {
        try {
            const headers = await this.getHeaders();
            const response = await axios.patch(
                `${DESIGN_AUTOMATION_BASE}/forgeapps/me`,
                { nickname },
                { headers }
            );
            this.nickname = nickname;
            return response.data;
        } catch (error) {
            if (error.response?.status === 409) {
                console.log('Nickname already set');
                return { nickname };
            }
            throw error;
        }
    }

    /**
     * Upload AppBundle (Revit add-in .zip)
     */
    async uploadAppBundle(zipFilePath, engineVersion = '2024') {
        try {
            const headers = await this.getHeaders();
            const clientId = process.env.APS_CLIENT_ID;
            const appBundleId = `${clientId}.${this.appBundleName}`;
            const qualifiedId = `${appBundleId}+${engineVersion}`;

            console.log(`Uploading AppBundle with ID: ${appBundleId}`);
            console.log(`Qualified ID (with engine): ${qualifiedId}`);

            // 1. Create/Update AppBundle definition
            const bundleSpec = {
                id: this.appBundleName,
                engine: `Autodesk.Revit+${engineVersion}`,
                description: 'Revit Cloud Model Publisher AppBundle'
            };

            // For version creation, remove the id field (it's in the URL)
            const versionSpec = {
                engine: `Autodesk.Revit+${engineVersion}`,
                description: 'Revit Cloud Model Publisher AppBundle'
            };

            // Check if AppBundle exists (use unqualified ID for version endpoint)
            let appBundleExists = false;
            try {
                console.log('Checking if AppBundle exists...');
                console.log(`GET URL: ${DESIGN_AUTOMATION_BASE}/appbundles/${appBundleId}`);
                await axios.get(`${DESIGN_AUTOMATION_BASE}/appbundles/${appBundleId}`, { headers });
                appBundleExists = true;
                console.log('AppBundle exists');
            } catch (error) {
                if (error.response?.status === 404) {
                    console.log('AppBundle does not exist, will create new');
                } else if (error.response?.status === 400) {
                    // If we get 400 on GET, the AppBundle probably exists but ID format has issues
                    // Let's assume it exists and try to create a version
                    console.log('GET returned 400, assuming AppBundle exists');
                    appBundleExists = true;
                } else {
                    console.warn('Error checking AppBundle existence:', error.response?.data);
                }
            }

            let uploadUrl;
            if (appBundleExists) {
                // AppBundle exists, create new version
                // IMPORTANT: Use unqualified ID (just the name, not owner.name) for version endpoint
                console.log('Creating new version...');
                console.log(`POST URL: ${DESIGN_AUTOMATION_BASE}/appbundles/${this.appBundleName}/versions`);
                try {
                    const versionResponse = await axios.post(
                        `${DESIGN_AUTOMATION_BASE}/appbundles/${this.appBundleName}/versions`,
                        versionSpec,
                        { headers }
                    );
                    console.log('New version created successfully');
                    console.log('Version data:', JSON.stringify(versionResponse.data, null, 2));
                    uploadUrl = versionResponse.data.uploadParameters;
                    const newVersion = versionResponse.data.version;
                    console.log(`New AppBundle version number: ${newVersion}`);
                    // Save the version number to update the alias later
                    this.latestAppBundleVersion = newVersion;
                } catch (versionError) {
                    console.error('Version creation error:', versionError.response?.data || versionError.message);
                    throw versionError;
                }
            } else {
                // AppBundle doesn't exist, create it
                console.log('Creating new AppBundle...');
                try {
                    const createResponse = await axios.post(
                        `${DESIGN_AUTOMATION_BASE}/appbundles`,
                        bundleSpec,
                        { headers }
                    );
                    console.log('AppBundle created successfully');
                    uploadUrl = createResponse.data.uploadParameters;
                    const newVersion = createResponse.data.version || 1;
                    console.log(`New AppBundle version number: ${newVersion}`);
                    this.latestAppBundleVersion = newVersion;
                } catch (createError) {
                    if (createError.response?.status === 409) {
                        // 409 means it exists, try creating a version instead
                        console.log('Got 409, AppBundle exists. Creating version...');
                        console.log(`POST URL: ${DESIGN_AUTOMATION_BASE}/appbundles/${this.appBundleName}/versions`);
                        const versionResponse = await axios.post(
                            `${DESIGN_AUTOMATION_BASE}/appbundles/${this.appBundleName}/versions`,
                            versionSpec,
                            { headers }
                        );
                        console.log('New version created successfully');
                        uploadUrl = versionResponse.data.uploadParameters;
                        const newVersion = versionResponse.data.version;
                        console.log(`New AppBundle version number: ${newVersion}`);
                        this.latestAppBundleVersion = newVersion;
                    } else {
                        console.error('AppBundle creation error:', createError.response?.data || createError.message);
                        throw createError;
                    }
                }
            }

            // 2. Upload the .zip file
            console.log('Uploading ZIP file to S3...');
            const formData = new FormData();
            Object.entries(uploadUrl.formData).forEach(([key, value]) => {
                formData.append(key, value);
            });
            formData.append('file', fs.createReadStream(zipFilePath));

            await axios.post(uploadUrl.endpointURL, formData, {
                headers: formData.getHeaders()
            });
            console.log('ZIP file uploaded successfully');

            // 3. Create/Update alias (use unqualified ID)
            const versionToAlias = this.latestAppBundleVersion || 1;
            console.log(`Creating/updating production alias to point to version ${versionToAlias}...`);
            console.log(`POST URL: ${DESIGN_AUTOMATION_BASE}/appbundles/${this.appBundleName}/aliases`);
            await axios.post(
                `${DESIGN_AUTOMATION_BASE}/appbundles/${this.appBundleName}/aliases`,
                {
                    id: 'production',
                    version: versionToAlias
                },
                { headers }
            ).catch(async (err) => {
                if (err.response?.status === 409) {
                    console.log('Alias exists, updating...');
                    console.log(`PATCH URL: ${DESIGN_AUTOMATION_BASE}/appbundles/${this.appBundleName}/aliases/production`);
                    await axios.patch(
                        `${DESIGN_AUTOMATION_BASE}/appbundles/${this.appBundleName}/aliases/production`,
                        { version: versionToAlias },
                        { headers }
                    );
                    console.log(`✓ Alias 'production' updated to point to version ${versionToAlias}`);
                }
            });
            console.log('AppBundle upload complete!');

            return { id: `${appBundleId}+production`, alias: 'production' };
        } catch (error) {
            console.error('AppBundle upload failed:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get latest AppBundle version
     */
    async getLatestAppBundleVersion() {
        try {
            const headers = await this.getHeaders();
            const owner = process.env.APS_CLIENT_ID;
            const response = await axios.get(
                `${DESIGN_AUTOMATION_BASE}/appbundles/${owner}.${this.appBundleName}/versions`,
                { headers }
            );
            const versions = response.data.data || [];
            if (versions.length === 0) return 1;
            // Return the highest version number
            return Math.max(...versions.map(v => parseInt(v.split('+')[1]) || 1));
        } catch (error) {
            console.error('Failed to get AppBundle version:', error.message);
            return 'production'; // Fallback to alias
        }
    }

    /**
     * Create/Update Activity
     */
    async createActivity(engineVersion = '2026') {
        try {
            console.log('\n=== Activity Creation Started ===');
            console.log('Step 1: Getting auth headers...');
            const headers = await this.getHeaders();
            console.log('✓ Auth headers obtained');
            
            // First, list all activities to see what exists
            console.log('\nStep 2: Listing existing activities...');
            const listResponse = await axios.get(
                `${DESIGN_AUTOMATION_BASE}/activities`,
                { headers }
            );
            console.log('✓ Existing activities:', JSON.stringify(listResponse.data, null, 2));
            
            // Use client_id instead of nickname for the owner
            console.log('\nStep 3: Building activity specification...');
            const owner = process.env.APS_CLIENT_ID;
            console.log('  Owner (Client ID):', owner);
            const qualifiedAppBundleId = `${owner}.${this.appBundleName}+production`;
            console.log('  Qualified AppBundle ID:', qualifiedAppBundleId);
            const qualifiedActivityId = `${owner}.${this.activityName}`;
            console.log('  Qualified Activity ID:', qualifiedActivityId);

            const activitySpec = {
                commandLine: [`$(engine.path)\\\\revitcoreconsole.exe /al "$(appbundles[${this.appBundleName}].path)"`],
                parameters: {
                    inputJson: {
                        verb: 'get',
                        description: 'Input JSON with cloud model parameters',
                        localName: 'params.json'
                    },
                    result: {
                        verb: 'put',
                        description: 'Output result file',
                        localName: 'result.txt'
                    }
                },
                engine: `Autodesk.Revit+${engineVersion}`,
                appbundles: [qualifiedAppBundleId],
                description: `Activity to publish Revit Cloud Models (Revit ${engineVersion})`
            };
            console.log('✓ Activity spec:', JSON.stringify(activitySpec, null, 2));

            // Try to create new activity
            console.log('\nStep 4: Creating activity...');
            let activityVersion = 1;
            try {
                const createPayload = {
                    ...activitySpec,
                    id: this.activityName
                };
                console.log('  POST payload:', JSON.stringify(createPayload, null, 2));
                const response = await axios.post(
                    `${DESIGN_AUTOMATION_BASE}/activities`,
                    createPayload,
                    { headers }
                );
                console.log('✓ Activity created:', JSON.stringify(response.data, null, 2));
                activityVersion = response.data.version || 1;
            } catch (createError) {
                if (createError.response?.status === 409) {
                    // Activity exists - create a new version with the updated AppBundle
                    console.log('⚠ Activity already exists (409), creating new version...');
                    try {
                        const versionResponse = await axios.post(
                            `${DESIGN_AUTOMATION_BASE}/activities/${this.activityName}/versions`,
                            activitySpec,
                            { headers }
                        );
                        console.log('✓ New Activity version created:', JSON.stringify(versionResponse.data, null, 2));
                        activityVersion = versionResponse.data.version;
                    } catch (versionError) {
                        console.error('Failed to create new Activity version:', versionError.response?.data || versionError.message);
                        throw versionError;
                    }
                } else {
                    console.error('✗ Activity creation failed');
                    console.error('  Status:', createError.response?.status);
                    console.error('  Data:', JSON.stringify(createError.response?.data, null, 2));
                    throw createError;
                }
            }

            // Create or update alias for version (use unqualified ID)
            console.log('\nStep 5: Creating/updating alias...');
            const aliasPayload = {
                id: engineVersion,
                version: activityVersion
            };
            console.log('  Alias payload:', JSON.stringify(aliasPayload, null, 2));
            console.log(`  POST URL: ${DESIGN_AUTOMATION_BASE}/activities/${this.activityName}/aliases`);
            try {
                await axios.post(
                    `${DESIGN_AUTOMATION_BASE}/activities/${this.activityName}/aliases`,
                    aliasPayload,
                    { headers }
                );
                console.log(`✓ Created alias ${engineVersion} -> version ${activityVersion}`);
            } catch (aliasError) {
                if (aliasError.response?.status === 409) {
                    // Alias exists, update it
                    console.log('⚠ Alias exists, updating...');
                    console.log(`  PATCH URL: ${DESIGN_AUTOMATION_BASE}/activities/${this.activityName}/aliases/${engineVersion}`);
                    await axios.patch(
                        `${DESIGN_AUTOMATION_BASE}/activities/${this.activityName}/aliases/${engineVersion}`,
                        { version: activityVersion },
                        { headers }
                    );
                    console.log(`✓ Updated alias ${engineVersion} -> version ${activityVersion}`);
                } else {
                    console.error('✗ Alias creation failed');
                    console.error('  Status:', aliasError.response?.status);
                    console.error('  Data:', JSON.stringify(aliasError.response?.data, null, 2));
                    throw aliasError;
                }
            }

            console.log('\n✓✓✓ Activity creation complete! ✓✓✓');
            const result = { id: `${qualifiedActivityId}+${engineVersion}`, alias: engineVersion, version: activityVersion };
            console.log('Result:', JSON.stringify(result, null, 2));
            console.log('=== End Activity Creation ===\n');
            return result;
        } catch (error) {
            console.error('\n✗✗✗ Activity creation failed ✗✗✗');
            console.error('Error type:', error.constructor.name);
            console.error('Error message:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', JSON.stringify(error.response.data, null, 2));
            }
            console.error('=== End Activity Creation (Failed) ===\n');
            throw error;
        }
    }

    /**
     * Create WorkItem to run the automation
     */
    async createWorkItem(cloudModelParams, userToken, callbackUrl, revitVersion = '2026') {
        try {
            const headers = await this.getHeaders();
            
            // First check if AppBundle exists by trying to get it
            const owner = process.env.APS_CLIENT_ID;
            const appBundleId = `${owner}.${this.appBundleName}+production`;
            
            try {
                await axios.get(
                    `${DESIGN_AUTOMATION_BASE}/appbundles/${appBundleId}`,
                    { headers }
                );
                console.log('✓ AppBundle exists:', appBundleId);
            } catch (error) {
                if (error.response?.status === 404 || error.response?.status === 400) {
                    throw new Error('AppBundle not found. Please upload the AppBundle first using the "Upload AppBundle" button in Section 2.');
                }
                throw error;
            }
            
            // Use the Activity with the appropriate alias for the Revit version
            const engineVersion = revitVersion; // e.g., "2026"
            const activityId = `${owner}.${this.activityName}+${engineVersion}`;

            // Build input JSON with cloud model parameters (similar to official sample)
            const { region, projectGuid, modelGuid} = cloudModelParams;
            const inputJson = {
                Region: region,
                ProjectGuid: projectGuid,
                ModelGuid: modelGuid
            };

            const workItemSpec = {
                activityId,
                arguments: {
                    inputJson: {
                        url: `data:application/json,${JSON.stringify(inputJson)}`
                    },
                    // Note: result parameter omitted - not needed for cloud model publish
                    // REQUIRED for Revit Cloud Model access - provides user authentication context
                    adsk3LeggedToken: userToken
                }
            };

            console.log('Creating WorkItem:', JSON.stringify(workItemSpec, null, 2));

            const response = await axios.post(
                `${DESIGN_AUTOMATION_BASE}/workitems`,
                workItemSpec,
                { headers }
            );

            return {
                workItemId: response.data.id,
                status: response.data.status
            };
        } catch (error) {
            console.error('WorkItem creation failed:');
            console.error('Status:', error.response?.status);
            console.error('Error data:', JSON.stringify(error.response?.data, null, 2));
            console.error('Error message:', error.message);
            throw error;
        }
    }

    /**
     * Get WorkItem status
     */
    async getWorkItemStatus(workItemId) {
        try {
            const headers = await this.getHeaders();
            const response = await axios.get(
                `${DESIGN_AUTOMATION_BASE}/workitems/${workItemId}`,
                { headers }
            );
            return response.data;
        } catch (error) {
            console.error('Failed to get WorkItem status:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new DesignAutomationService();
