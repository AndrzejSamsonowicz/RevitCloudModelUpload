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

    async getHeaders(userCredentials = null) {
        const token = userCredentials 
            ? await apsClient.get2LeggedTokenForUser(['code:all'], userCredentials.clientId, userCredentials.clientSecret)
            : await apsClient.get2LeggedToken(['code:all']);
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
    async uploadAppBundle(zipFilePath, engineVersion = '2024', userCredentials = null) {
        try {
            const headers = await this.getHeaders(userCredentials);
            const clientId = userCredentials ? userCredentials.clientId : process.env.APS_CLIENT_ID;
            const appBundleId = `${clientId}.${this.appBundleName}`;
            const qualifiedId = `${appBundleId}+${engineVersion}`;

            console.log(`[AppBundle Upload] Uploading for Client ID: ${clientId?.substring(0, 10)}...`);
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
    async createActivity(engineVersion = '2026', userCredentials = null) {
        try {
            console.log('\n=== Activity Creation Started ===');
            console.log('Step 1: Getting auth headers...');
            const headers = await this.getHeaders(userCredentials);
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
            const owner = userCredentials ? userCredentials.clientId : process.env.APS_CLIENT_ID;
            console.log('  Owner (Client ID):', owner?.substring(0, 10) + '...');
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
    async createWorkItem(cloudModelParams, userToken, callbackUrl, revitVersion = '2026', userCredentials = null) {
        try {
            const headers = await this.getHeaders(userCredentials);
            
            // First check if AppBundle exists by trying to get it
            const owner = userCredentials ? userCredentials.clientId : process.env.APS_CLIENT_ID;
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
                    // REQUIRED for Revit Cloud Model access - provides user authentication context
                    adsk3LeggedToken: userToken
                },
                // Callback when WorkItem completes (success or failure)
                onComplete: {
                    verb: 'post',
                    url: callbackUrl
                }
            };

            console.log('Creating WorkItem:', JSON.stringify(workItemSpec, null, 2));
            console.log('Callback URL:', callbackUrl);

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

    /**
     * Detect Revit file version using BasicFileInfo AppBundle
     * Creates a WorkItem that extracts file info without opening the file
     */
    async detectFileVersion(itemId, projectId, fileName, userCredentials = null) {
        try {
            console.log(`[Version Detection] Starting detection for: ${fileName}`);
            
            // Set user credentials if provided
            if (userCredentials) {
                this.clientId = userCredentials.clientId;
                this.clientSecret = userCredentials.clientSecret;
            }

            // Get user token for downloading the file
            const token = await this.getAccessToken();
            
            // Construct download URL for the Revit file
            const downloadUrl = `https://developer.api.autodesk.com/data/v1/projects/${projectId}/items/${itemId}/versions/1`;
            
            // Create WorkItem payload
            const activityId = `${this.nickname}.DetectRevitVersionActivity+2026`;
            const workItemPayload = {
                activityId,
                arguments: {
                    inputFile: {
                        url: downloadUrl,
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    },
                    result: {
                        verb: 'put',
                        url: `https://developer.api.autodesk.com/oss/v2/buckets/revitpublisher-workitems/objects/${itemId}_version.json`,
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                }
            };

            console.log(`[Version Detection] Creating WorkItem with Activity: ${activityId}`);
            
            const headers = await this.getHeaders();
            const response = await axios.post(
                `${DESIGN_AUTOMATION_BASE}/workitems`,
                workItemPayload,
                { headers }
            );

            console.log(`[Version Detection] WorkItem created: ${response.data.id}`);
            console.log(`[Version Detection] Status: ${response.data.status}`);

            return {
                workItemId: response.data.id,
                status: response.data.status,
                activityId,
                fileName
            };
        } catch (error) {
            console.error('[Version Detection Error]:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get version detection result from completed WorkItem
     * Downloads and parses the result.json file
     */
    async getVersionDetectionResult(workItemId, userCredentials = null) {
        try {
            console.log(`[Get Version Result] Checking WorkItem: ${workItemId}`);
            
            // Set user credentials if provided
            if (userCredentials) {
                this.clientId = userCredentials.clientId;
                this.clientSecret = userCredentials.clientSecret;
            }

            // Get WorkItem status
            const headers = await this.getHeaders();
            const response = await axios.get(
                `${DESIGN_AUTOMATION_BASE}/workitems/${workItemId}`,
                { headers }
            );

            const workItem = response.data;
            console.log(`[Get Version Result] WorkItem status: ${workItem.status}`);

            // If not completed yet, return status
            if (workItem.status !== 'success' && workItem.status !== 'failedInstructions') {
                return {
                    status: workItem.status,
                    completed: false,
                    workItemId
                };
            }

            // If failed, return error
            if (workItem.status === 'failedInstructions' || workItem.status === 'failed') {
                return {
                    status: 'failed',
                    completed: true,
                    error: 'Version detection failed',
                    reportUrl: workItem.reportUrl,
                    workItemId
                };
            }

            // Download result.json
            const resultUrl = workItem.arguments?.result?.url;
            if (!resultUrl) {
                throw new Error('No result URL found in WorkItem');
            }

            console.log('[Get Version Result] Downloading result.json...');
            const token = await this.getAccessToken();
            const resultResponse = await axios.get(resultUrl, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const versionInfo = resultResponse.data;
            console.log('[Get Version Result] Version detected:', versionInfo.format);

            return {
                status: 'success',
                completed: true,
                versionInfo,
                workItemId
            };
        } catch (error) {
            console.error('[Get Version Result Error]:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Upload RevitFileInfoExtractor AppBundle (version detection)
     * This should be called once during setup
     */
    async uploadFileInfoAppBundle(bundlePath, userCredentials = null) {
        try {
            console.log('[Upload FileInfo AppBundle] Starting upload...');
            
            // Set user credentials if provided
            if (userCredentials) {
                this.clientId = userCredentials.clientId;
                this.clientSecret = userCredentials.clientSecret;
            }

            const appBundleId = 'RevitFileInfoExtractor';
            const alias = 'production';
            const engine = 'Autodesk.Revit+2026';

            // Create AppBundle
            const headers = await this.getHeaders();
            const appBundleSpec = {
                id: appBundleId,
                engine,
                description: 'Detects Revit file version using BasicFileInfo API'
            };

            console.log('[Upload FileInfo AppBundle] Creating AppBundle...');
            let appBundleResponse;
            try {
                appBundleResponse = await axios.post(
                    `${DESIGN_AUTOMATION_BASE}/appbundles`,
                    appBundleSpec,
                    { headers }
                );
            } catch (error) {
                if (error.response?.status === 409) {
                    console.log('[Upload FileInfo AppBundle] AppBundle exists, creating new version...');
                    appBundleResponse = await axios.post(
                        `${DESIGN_AUTOMATION_BASE}/appbundles/${appBundleId}/versions`,
                        { 
                            engine,
                            description: 'Detects Revit file version using BasicFileInfo API'
                        },
                        { headers }
                    );
                } else {
                    throw error;
                }
            }

            // Upload bundle file
            const uploadUrl = appBundleResponse.data.uploadParameters.endpointURL;
            const formData = appBundleResponse.data.uploadParameters.formData;

            console.log('[Upload FileInfo AppBundle] Uploading ZIP file...');
            const fs = require('fs');
            const FormData = require('form-data');
            const form = new FormData();

            // Append form data fields
            Object.keys(formData).forEach(key => {
                form.append(key, formData[key]);
            });

            // Append file
            form.append('file', fs.createReadStream(bundlePath));

            await axios.post(uploadUrl, form, {
                headers: form.getHeaders()
            });

            console.log('[Upload FileInfo AppBundle] Creating alias...');
            try {
                await axios.post(
                    `${DESIGN_AUTOMATION_BASE}/appbundles/${appBundleId}/aliases`,
                    { id: alias, version: appBundleResponse.data.version },
                    { headers }
                );
            } catch (error) {
                if (error.response?.status === 409) {
                    await axios.patch(
                        `${DESIGN_AUTOMATION_BASE}/appbundles/${appBundleId}/aliases/${alias}`,
                        { version: appBundleResponse.data.version },
                        { headers }
                    );
                } else {
                    throw error;
                }
            }

            console.log('[Upload FileInfo AppBundle] ✓ AppBundle uploaded successfully');

            return {
                id: `${this.nickname}.${appBundleId}+${alias}`,
                version: appBundleResponse.data.version
            };
        } catch (error) {
            console.error('[Upload FileInfo AppBundle Error]:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Create DetectRevitVersion Activity
     * Uses the RevitFileInfoExtractor AppBundle
     */
    async createVersionDetectionActivity(userCredentials = null) {
        try {
            console.log('[Create Version Detection Activity] Starting...');
            
            // Set user credentials if provided
            if (userCredentials) {
                this.clientId = userCredentials.clientId;
                this.clientSecret = userCredentials.clientSecret;
            }

            const activityId = 'DetectRevitVersionActivity';
            const alias = '2026';
            const engine = 'Autodesk.Revit+2026';
            const appBundleId = `${this.nickname}.RevitFileInfoExtractor+production`;

            const activitySpec = {
                id: activityId,
                commandLine: [`$(engine.path)\\\\revitcoreconsole.exe /i $(args[inputFile].path) /al $(appbundles[RevitFileInfoExtractor].path)`],
                parameters: {
                    inputFile: {
                        verb: 'get',
                        description: 'Input Revit file',
                        required: true,
                        localName: 'input.rvt'
                    },
                    result: {
                        verb: 'put',
                        description: 'Version detection result JSON',
                        required: true,
                        localName: 'result.json'
                    }
                },
                engine,
                appbundles: [appBundleId],
                description: 'Detects Revit file version using BasicFileInfo API'
            };

            const headers = await this.getHeaders();
            console.log('[Create Version Detection Activity] Creating Activity...');
            
            let activityResponse;
            try {
                activityResponse = await axios.post(
                    `${DESIGN_AUTOMATION_BASE}/activities`,
                    activitySpec,
                    { headers }
                );
            } catch (error) {
                if (error.response?.status === 409) {
                    console.log('[Create Version Detection Activity] Activity exists, creating new version...');
                    activityResponse = await axios.post(
                        `${DESIGN_AUTOMATION_BASE}/activities/${activityId}/versions`,
                        activitySpec,
                        { headers }
                    );
                } else {
                    throw error;
                }
            }

            console.log('[Create Version Detection Activity] Creating alias...');
            try {
                await axios.post(
                    `${DESIGN_AUTOMATION_BASE}/activities/${activityId}/aliases`,
                    { id: alias, version: activityResponse.data.version },
                    { headers }
                );
            } catch (error) {
                if (error.response?.status === 409) {
                    await axios.patch(
                        `${DESIGN_AUTOMATION_BASE}/activities/${activityId}/aliases/${alias}`,
                        { version: activityResponse.data.version },
                        { headers }
                    );
                } else {
                    throw error;
                }
            }

            console.log('[Create Version Detection Activity] ✓ Activity created successfully');

            return {
                id: `${this.nickname}.${activityId}+${alias}`,
                version: activityResponse.data.version
            };
        } catch (error) {
            console.error('[Create Version Detection Activity Error]:', error.response?.data || error.message);
            throw error;
        }
    }
}

module.exports = new DesignAutomationService();
