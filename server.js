require('dotenv').config();
const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

// Initialize routes
const authRoutes = require('./routes/auth');
const designAutomationRoutes = require('./routes/designAutomation');
const webhookRoutes = require('./routes/webhooks');
const dataManagementRoutes = require('./routes/dataManagement');
const { router: firebaseAuthRoutes } = require('./routes/firebaseAuth');
const licenseRoutes = require('./routes/licenses');

// Initialize Firebase Admin SDK
try {
    let serviceAccount;
    
    // Try to load service account from file
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
    } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        // Use individual credentials from environment variables
        serviceAccount = {
            type: "service_account",
            project_id: process.env.FIREBASE_PROJECT_ID,
            private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            client_email: process.env.FIREBASE_CLIENT_EMAIL
        };
    } else {
        console.warn('⚠ Firebase credentials not configured. Authentication features will be disabled.');
    }
    
    if (serviceAccount) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
        });
        console.log('✓ Firebase Admin SDK initialized');
    }
} catch (error) {
    console.error('✗ Failed to initialize Firebase Admin SDK:', error.message);
    console.warn('⚠ Authentication features will be disabled.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/oauth', authRoutes);
app.use('/api/design-automation', designAutomationRoutes);
app.use('/api/data-management', dataManagementRoutes);
app.use('/api/auth', firebaseAuthRoutes);
app.use('/api', licenseRoutes);
app.use('/webhooks', webhookRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/purchase', (req, res) => {
    res.sendFile(path.join(__dirname, 'purchase.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
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
    console.log(`✓ Firebase: ${admin.apps.length > 0 ? 'Connected' : 'Not configured'}`);
});

