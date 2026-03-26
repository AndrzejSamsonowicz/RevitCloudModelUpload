require('dotenv').config();
const express = require('express');
const path = require('path');
const admin = require('firebase-admin');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// ===== ENVIRONMENT VARIABLE VALIDATION =====
const requiredEnvVars = [
    'APS_CLIENT_ID',
    'APS_CLIENT_SECRET',
    'APS_CALLBACK_URL',
    'ENCRYPTION_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error('❌ ERROR: Missing required environment variables:', missingVars);
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

// Validate ENCRYPTION_KEY length
if (process.env.ENCRYPTION_KEY.length < 64) {
    console.error('❌ ERROR: ENCRYPTION_KEY must be at least 64 characters (32 bytes in hex)');
    console.error('Generate a secure key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}

// Initialize services
const designAutomation = require('./services/designAutomation');
const WorkItemPoller = require('./services/workItemPoller');

// Initialize routes
const authRoutes = require('./routes/auth');
const designAutomationRoutes = require('./routes/designAutomation');
const webhookRoutes = require('./routes/webhooks');
const workitemStatusRoutes = require('./routes/workitemStatus');
const dataManagementRoutes = require('./routes/dataManagement');
const { router: firebaseAuthRoutes } = require('./routes/firebaseAuth');
const licenseRoutes = require('./routes/licenses');
const adminToolsRoutes = require('./routes/adminTools');

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

// Initialize WorkItem Poller (for tracking scheduled publish WorkItems)
const workItemPoller = new WorkItemPoller(designAutomation);
global.workItemPoller = workItemPoller; // Make available globally
console.log('✓ WorkItem Poller initialized');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== SECURITY MIDDLEWARE =====

// 1. Helmet - Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", 
                "https://www.gstatic.com", 
                "https://apis.google.com"
            ],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'", // Still needed for inline styles in HTML
                "https://fonts.googleapis.com"
            ],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: [
                "'self'", 
                "https://www.gstatic.com", // Firebase source maps
                "https://developer.api.autodesk.com",
                "https://firebasestorage.googleapis.com",
                "https://firestore.googleapis.com",
                "https://identitytoolkit.googleapis.com",
                "https://securetoken.googleapis.com",
                "https://*.firebaseio.com"
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            objectSrc: ["'none'"],
            frameSrc: ["https://www.youtube.com"], // For video modals
            upgradeInsecureRequests: null // MUST be null (not false) to disable - VM runs on HTTP without SSL
        }
    },
    hsts: false, // Disabled - VM runs on HTTP without SSL certificates
    crossOriginOpenerPolicy: false, // Disabled - requires HTTPS
    crossOriginResourcePolicy: false, // Disabled - requires HTTPS
    crossOriginEmbedderPolicy: false // Disabled - requires HTTPS
}));

// 2. CORS Protection
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://34.65.169.15:3000', // VM IP address
    'http://rvtpub.digibuild.ch:3000', // Custom domain with port
    'http://rvtpub.digibuild.ch', // Custom domain (via Nginx on port 80)
    process.env.FRONTEND_URL,
    process.env.PRODUCTION_URL
].filter(Boolean); // Remove undefined values

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, postman, etc)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 3. HTTPS Enforcement in Production
// DISABLED - VM runs on HTTP without SSL certificates
// if (process.env.NODE_ENV === 'production') {
//     app.use((req, res, next) => {
//         if (req.header('x-forwarded-proto') !== 'https') {
//             res.redirect(`https://${req.header('host')}${req.url}`);
//         } else {
//             next();
//         }
//     });
// }

// 4. Request Size Limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests from this IP, please try again later' },
    standardHeaders: true,
    legacyHeaders: false
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    message: { error: 'Too many authentication attempts, please try again later' },
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Log all incoming requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API Routes with rate limiting
app.use('/oauth', authLimiter, authRoutes);
app.use('/api/auth', authLimiter, firebaseAuthRoutes);
app.use('/api/design-automation', apiLimiter, designAutomationRoutes);
app.use('/api/data-management', apiLimiter, dataManagementRoutes);
app.use('/api/admin', apiLimiter, adminToolsRoutes);
app.use('/api', apiLimiter, licenseRoutes);
app.use('/webhooks', webhookRoutes); // No rate limit on webhooks
app.use('/api/workitem-status', apiLimiter, workitemStatusRoutes);

// Serve frontend pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/purchase', (req, res) => {
    res.sendFile(path.join(__dirname, 'purchase.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    // Log full error server-side
    console.error('[Error Handler]', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        timestamp: new Date().toISOString()
    });
    
    // Determine status code
    const statusCode = err.statusCode || err.status || 500;
    
    // Send sanitized error to client
    const isClientError = statusCode < 500;
    const message = isClientError ? err.message : 'Internal server error';
    
    const errorResponse = { error: message };
    
    // Only include stack trace in local development
    if (process.env.NODE_ENV === 'development' && req.ip === '::1' || req.ip === '127.0.0.1') {
        errorResponse.stack = err.stack;
    }
    
    res.status(statusCode).json(errorResponse);
});

app.listen(PORT, () => {
    console.log(`✓ Server running on http://localhost:${PORT}`);
    console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`✓ APS Client ID: ${process.env.APS_CLIENT_ID ? '***' + process.env.APS_CLIENT_ID.slice(-4) : 'NOT SET'}`);
    console.log(`✓ Firebase: ${admin.apps.length > 0 ? 'Connected' : 'Not configured'}`);
});

