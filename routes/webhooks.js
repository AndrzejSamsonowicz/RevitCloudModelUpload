const express = require('express');
const router = express.Router();

// Store webhook results (in production, use database)
const webhookResults = new Map();

/**
 * Design Automation webhook callback
 */
router.post('/design-automation', express.json(), (req, res) => {
    console.log('Design Automation webhook received:', JSON.stringify(req.body, null, 2));

    const { id, status, reportUrl, stats } = req.body;

    // Store result
    webhookResults.set(id, {
        status,
        reportUrl,
        stats,
        timestamp: Date.now(),
        body: req.body
    });

    // Respond immediately
    res.status(200).send('OK');

    // Log the result
    console.log(`WorkItem ${id} completed with status: ${status}`);
    if (reportUrl) {
        console.log(`Report URL: ${reportUrl}`);
    }
});

/**
 * Get webhook result by WorkItem ID
 */
router.get('/result/:workItemId', (req, res) => {
    const result = webhookResults.get(req.params.workItemId);
    
    if (!result) {
        return res.status(404).json({ error: 'Result not found' });
    }

    res.json({ success: true, data: result });
});

/**
 * Receive result file upload
 */
router.put('/design-automation/result.txt', express.text({ type: '*/*' }), (req, res) => {
    console.log('Result file received:', req.body);
    res.status(200).send('OK');
});

module.exports = router;
