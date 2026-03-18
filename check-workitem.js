// Quick diagnostic script to check WorkItem status
const axios = require('axios');

const workItemId = process.argv[2];
if (!workItemId) {
    console.error('Usage: node check-workitem.js <workItemId>');
    process.exit(1);
}

async function checkWorkItem() {
    try {
        // Get token
        const tokenResponse = await axios.post('https://developer.api.autodesk.com/authentication/v2/token', 
            `client_id=${process.env.APS_CLIENT_ID}&client_secret=${process.env.APS_CLIENT_SECRET}&grant_type=client_credentials&scope=code:all`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        const token = tokenResponse.data.access_token;
        
        // Get WorkItem details
        const workItemResponse = await axios.get(
            `https://developer.api.autodesk.com/da/us-east/v3/workitems/${workItemId}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        
        console.log('\n=== WORKITEM DETAILS ===');
        console.log(JSON.stringify(workItemResponse.data, null, 2));
        
        // Check if onComplete is set
        if (workItemResponse.data.onComplete) {
            console.log('\n✓ onComplete callback configured:');
            console.log(JSON.stringify(workItemResponse.data.onComplete, null, 2));
        } else {
            console.log('\n✗ NO onComplete callback configured!');
        }
        
        console.log('\n=== STATUS ===');
        console.log(`Status: ${workItemResponse.data.status}`);
        
        if (workItemResponse.data.reportUrl) {
            console.log(`\nReport URL: ${workItemResponse.data.reportUrl}`);
            
            // Fetch the report
            try {
                const reportResponse = await axios.get(workItemResponse.data.reportUrl);
                console.log('\n=== REPORT ===');
                console.log(reportResponse.data);
            } catch (reportError) {
                console.log('Could not fetch report:', reportError.message);
            }
        }
        
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

checkWorkItem();
