/**
 * Check Design Automation setup using provided credentials
 * Usage: node check-activities-direct.js <clientId> <clientSecret>
 */

const axios = require('axios');

async function checkDesignAutomation(clientId, clientSecret) {
    try {
        console.log(`Client ID: ${clientId}\n`);
        
        // Get 2-legged token
        console.log('Getting 2-legged OAuth token...');
        const tokenResponse = await axios.post(
            'https://developer.api.autodesk.com/authentication/v2/token',
            new URLSearchParams({
                grant_type: 'client_credentials',
                scope: 'code:all'
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
                }
            }
        );
        
        const token = tokenResponse.data.access_token;
        console.log('✓ Token obtained\n');
        
        // Get nickname
        const nicknameResponse = await axios.get(
            'https://developer.api.autodesk.com/da/us-east/v3/forgeapps/me',
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const nickname = nicknameResponse.data;
        console.log(`Forge App Nickname: ${nickname}\n`);
        
        // List AppBundles
        console.log('='.repeat(80));
        console.log('APP BUNDLES');
        console.log('='.repeat(80));
        
        try {
            const bundlesResponse = await axios.get(
                'https://developer.api.autodesk.com/da/us-east/v3/appbundles',
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            const bundles = bundlesResponse.data.data || [];
            const userBundles = bundles.filter(b => b.startsWith(nickname));
            
            if (userBundles.length === 0) {
                console.log('❌ No AppBundles found\n');
            } else {
                console.log(`Found ${userBundles.length} AppBundle(s):\n`);
                
                for (const bundleId of userBundles) {
                    // Get bundle details
                    const bundleDetails = await axios.get(
                        `https://developer.api.autodesk.com/da/us-east/v3/appbundles/${bundleId}`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    
                    const bundle = bundleDetails.data;
                    console.log(`  📦 ${bundleId}`);
                    console.log(`     Version: ${bundle.version}`);
                    console.log(`     Engine: ${bundle.engine}`);
                    console.log(`     Description: ${bundle.description || 'N/A'}`);
                    console.log();
                }
            }
        } catch (error) {
            console.log(`❌ Error listing AppBundles: ${error.response?.data?.title || error.message}\n`);
        }
        
        // List Activities
        console.log('='.repeat(80));
        console.log('ACTIVITIES');
        console.log('='.repeat(80));
        
        try {
            const activitiesResponse = await axios.get(
                'https://developer.api.autodesk.com/da/us-east/v3/activities',
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            const activities = activitiesResponse.data.data || [];
            const userActivities = activities.filter(a => a.startsWith(nickname));
            
            if (userActivities.length === 0) {
                console.log('❌ No Activities found\n');
                console.log('💡 User needs Activities created for Revit 2024, 2025, 2026\n');
            } else {
                console.log(`Found ${userActivities.length} Activity(ies):\n`);
                
                for (const activityId of userActivities) {
                    // Get activity details
                    const activityDetails = await axios.get(
                        `https://developer.api.autodesk.com/da/us-east/v3/activities/${activityId}`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    
                    const activity = activityDetails.data;
                    console.log(`  ⚡ ${activityId}`);
                    console.log(`     Version: ${activity.version}`);
                    console.log(`     Engine: ${activity.engine}`);
                    console.log(`     AppBundle: ${activity.appbundles?.[0] || 'N/A'}`);
                    console.log(`     Description: ${activity.description || 'N/A'}`);
                    
                    // Determine Revit version from engine
                    const revitVersion = activity.engine.includes('+2024') ? '2024' :
                                       activity.engine.includes('+2025') ? '2025' :
                                       activity.engine.includes('+2026') ? '2026' :
                                       activity.engine.match(/\+(\d{4})$/)?.[1] || 'Unknown';
                    console.log(`     🏗️  Revit Version: ${revitVersion}`);
                    console.log();
                }
                
                // Check which versions are missing
                const hasVersions = {
                    '2024': userActivities.some(a => a.includes('2024')),
                    '2025': userActivities.some(a => a.includes('2025')),
                    '2026': userActivities.some(a => a.includes('2026'))
                };
                
                console.log('Version Coverage:');
                console.log(`  ${hasVersions['2024'] ? '✅' : '❌'} Revit 2024`);
                console.log(`  ${hasVersions['2025'] ? '✅' : '❌'} Revit 2025`);
                console.log(`  ${hasVersions['2026'] ? '✅' : '❌'} Revit 2026`);
                console.log();
            }
        } catch (error) {
            console.log(`❌ Error listing Activities: ${error.response?.data?.title || error.message}\n`);
        }
        
        // Summary and recommendations
        console.log('='.repeat(80));
        console.log('RECOMMENDATIONS');
        console.log('='.repeat(80));
        console.log('To support Revit 2024/2025/2026 files, you need:');
        console.log('  1. ✅ One AppBundle (supports multiple Revit versions)');
        console.log('  2. ⚠️  Three Activities (one for each Revit version):');
        console.log('     - PublishCloudModelActivity+2024');
        console.log('     - PublishCloudModelActivity+2025');
        console.log('     - PublishCloudModelActivity+2026\n');
        console.log('Create missing Activities via the app UI or API.\n');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response?.data) {
            console.error('API Response:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.response?.status === 401) {
            console.error('\n⚠️  Authentication failed. Check Client ID and Secret.');
        }
    }
}

// Parse command line arguments
const clientId = process.argv[2];
const clientSecret = process.argv[3];

if (!clientId || !clientSecret) {
    console.error('❌ ERROR: Client ID and Secret required\n');
    console.log('Usage: node check-activities-direct.js <clientId> <clientSecret>');
    console.log('Example: node check-activities-direct.js abc123... xyz789...\n');
    process.exit(1);
}

// Run the check
checkDesignAutomation(clientId, clientSecret).then(() => {
    process.exit(0);
}).catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
});
