// Quick script to check WorkItem status
const axios = require('axios');

const workItems = [
    { id: '0c14094232af4b3386ff0726dac4d296', name: 'FH_MEP_Hea.rvt' },
    { id: 'dc86832a2f344b9bb3ca1cbf2be37e3e', name: 'FH_Stavba.rvt' }
];

// You'll need to update this with your actual token
const ACCESS_TOKEN = process.env.APS_ACCESS_TOKEN || 'YOUR_TOKEN_HERE';

async function checkWorkItems() {
    console.log('🔍 Checking WorkItem Status...\n');
    
    for (const item of workItems) {
        try {
            const response = await axios.get(
                `https://developer.api.autodesk.com/da/us-east/v3/workitems/${item.id}`,
                {
                    headers: {
                        'Authorization': `Bearer ${ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const data = response.data;
            const statusIcon = data.status === 'success' ? '✓' : 
                               data.status === 'failed' ? '✗' : 
                               data.status === 'inprogress' ? '⏳' : 
                               data.status === 'pending' ? '⏸' : '?';

            console.log(`${statusIcon} ${item.name}`);
            console.log(`   Status: ${data.status}`);
            if (data.progress) console.log(`   Progress: ${data.progress}`);
            if (data.stats) {
                console.log(`   Queued: ${data.stats.timeQueued || 0}s`);
                console.log(`   Processing: ${data.stats.timeInstructionsTotalTime || 0}s`);
            }
            if (data.reportUrl) {
                console.log(`   Report: ${data.reportUrl}`);
            }
            console.log('');
        } catch (error) {
            console.log(`✗ ${item.name}`);
            console.log(`   Error: ${error.response?.data?.detail || error.message}`);
            console.log('');
        }
    }
}

checkWorkItems().catch(console.error);
