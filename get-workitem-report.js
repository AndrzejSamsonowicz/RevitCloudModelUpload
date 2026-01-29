const axios = require('axios');
const apsClient = require('./services/apsClient');

const workItemId = process.argv[2] || '0e7bd670ce99448ea9496093744ad7f4';

(async () => {
    try {
        // Get 2-legged token
        const clientId = process.env.APS_CLIENT_ID;
        const clientSecret = process.env.APS_CLIENT_SECRET;
        
        const authResponse = await axios.post(
            'https://developer.api.autodesk.com/authentication/v2/token',
            `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials&scope=code:all`,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        const token = authResponse.data.access_token;
        
        // Get WorkItem
        const wiResponse = await axios.get(
            `https://developer.api.autodesk.com/da/us-east/v3/workitems/${workItemId}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        
        console.log('Status:', wiResponse.data.status);
        console.log('Report URL:', wiResponse.data.reportUrl);
        
        if (wiResponse.data.reportUrl) {
            console.log('\n=== DOWNLOADING REPORT ===\n');
            const reportResponse = await axios.get(wiResponse.data.reportUrl);
            console.log(reportResponse.data);
        }
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
})();
