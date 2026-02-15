/**
 * Firebase Authentication Routes
 * Handles user registration, login, email verification, and password reset
 */

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Helper functions to access Firebase services (initialized in server.js)
const getDb = () => admin.firestore();
const getAuth = () => admin.auth();

/**
 * Verify Firebase ID Token Middleware
 * Protects routes that require authentication
 */
async function verifyFirebaseToken(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        req.user = decodedToken;
        req.userId = decodedToken.uid;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

/**
 * GET /api/auth/verify
 * Verify user's authentication status and return user data
 */
router.get('/verify', verifyFirebaseToken, async (req, res) => {
    try {
        const userDoc = await getDb().collection('users').doc(req.userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        
        // Check if user has active license
        const hasActiveLicense = userData.licenseKey && 
                                 userData.licenseStatus === 'active' &&
                                 userData.licenseExpiry && 
                                 new Date(userData.licenseExpiry) > new Date();
        
        res.json({
            success: true,
            user: {
                uid: req.userId,
                email: userData.email,
                hasActiveLicense: hasActiveLicense,
                licenseStatus: userData.licenseStatus || 'none',
                licenseExpiry: userData.licenseExpiry || null,
                isAdmin: userData.isAdmin || false,
                createdAt: userData.createdAt
            }
        });
    } catch (error) {
        console.error('User verification error:', error);
        res.status(500).json({ error: 'Failed to verify user' });
    }
});

/**
 * GET /api/auth/user/:userId
 * Get user data by user ID (admin only)
 */
router.get('/user/:userId', verifyFirebaseToken, async (req, res) => {
    try {
        // Check if requester is admin
        const adminDoc = await getDb().collection('users').doc(req.userId).get();
        if (!adminDoc.exists || !adminDoc.data().isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        
        const userDoc = await getDb().collection('users').doc(req.params.userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        
        res.json({
            success: true,
            user: {
                uid: req.params.userId,
                email: userData.email,
                licenseKey: userData.licenseKey,
                licenseStatus: userData.licenseStatus,
                licenseExpiry: userData.licenseExpiry,
                isAdmin: userData.isAdmin || false,
                createdAt: userData.createdAt,
                lastLogin: userData.lastLogin
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user data' });
    }
});

/**
 * PUT /api/auth/user/credentials
 * Store encrypted APS credentials for authenticated user
 */
router.put('/user/credentials', verifyFirebaseToken, async (req, res) => {
    try {
        const { encryptedClientId, encryptedClientSecret, encryptionIV } = req.body;
        
        if (!encryptedClientId || !encryptedClientSecret || !encryptionIV) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        await getDb().collection('users').doc(req.userId).update({
            encryptedClientId,
            encryptedClientSecret,
            encryptionIV,
            credentialsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ success: true, message: 'Credentials stored successfully' });
    } catch (error) {
        console.error('Store credentials error:', error);
        res.status(500).json({ error: 'Failed to store credentials' });
    }
});

/**
 * GET /api/auth/user/credentials
 * Retrieve encrypted APS credentials for authenticated user
 */
router.get('/user/credentials', verifyFirebaseToken, async (req, res) => {
    try {
        const userDoc = await getDb().collection('users').doc(req.userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        
        res.json({
            success: true,
            credentials: {
                encryptedClientId: userData.encryptedClientId || '',
                encryptedClientSecret: userData.encryptedClientSecret || '',
                encryptionIV: userData.encryptionIV || ''
            }
        });
    } catch (error) {
        console.error('Get credentials error:', error);
        res.status(500).json({ error: 'Failed to retrieve credentials' });
    }
});

/**
 * POST /api/auth/update-last-login
 * Update user's last login timestamp
 */
router.post('/update-last-login', verifyFirebaseToken, async (req, res) => {
    try {
        await getDb().collection('users').doc(req.userId).update({
            lastLogin: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Update last login error:', error);
        res.status(500).json({ error: 'Failed to update last login' });
    }
});

module.exports = { router, verifyFirebaseToken };
