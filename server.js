require('dotenv').config();
const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth');
const designAutomationRoutes = require('./routes/designAutomation');
const webhookRoutes = require('./routes/webhooks');
const dataManagementRoutes = require('./routes/dataManagement');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/oauth', authRoutes);
app.use('/api/design-automation', designAutomationRoutes);
app.use('/api/data-management', dataManagementRoutes);
app.use('/webhooks', webhookRoutes);

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: err.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ APS Client ID: ${process.env.APS_CLIENT_ID ? '***' + process.env.APS_CLIENT_ID.slice(-4) : 'NOT SET'}`);
});

