/**
 * Firebase Authentication Routes
 * Handles user registration, login, email verification, and password reset
 */

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const crypto = require('crypto');

// Helper functions to access Firebase services (initialized in server.js)
const getDb = () => admin.firestore();
const getAuth = () => admin.auth();

/**
 * Helper function to decrypt user credentials
 */
async function decryptUserCredentials(userId) {
    const userDoc = await getDb().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
        return null;
    }
    
    const userData = userDoc.data();
    
    if (!userData.encryptedClientId || !userData.encryptedClientSecret) {
        return null;
    }
    
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32bytes', 'utf8').slice(0, 32);
    const iv = Buffer.from(userData.encryptionIV, 'hex');
    
    const decipherClientId = crypto.createDecipheriv(algorithm, key, iv);
    const decipherClientSecret = crypto.createDecipheriv(algorithm, key, iv);
    
    let clientId = decipherClientId.update(userData.encryptedClientId, 'hex', 'utf8');
    clientId += decipherClientId.final('utf8');
    
    let clientSecret = decipherClientSecret.update(userData.encryptedClientSecret, 'hex', 'utf8');
    clientSecret += decipherClientSecret.final('utf8');
    
    return { clientId, clientSecret };
}

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
 * Store APS credentials for authenticated user (server-side encryption)
 */
router.put('/user/credentials', verifyFirebaseToken, async (req, res) => {
    try {
        const { clientId, clientSecret } = req.body;
        
        if (!clientId || !clientSecret) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Encrypt credentials server-side
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32bytes', 'utf8').slice(0, 32);
        
        const iv = crypto.randomBytes(16);
        const cipherClientId = crypto.createCipheriv(algorithm, key, iv);
        const cipherClientSecret = crypto.createCipheriv(algorithm, key, iv);
        
        let encryptedClientId = cipherClientId.update(clientId, 'utf8', 'hex');
        encryptedClientId += cipherClientId.final('hex');
        
        let encryptedClientSecret = cipherClientSecret.update(clientSecret, 'utf8', 'hex');
        encryptedClientSecret += cipherClientSecret.final('hex');
        
        await getDb().collection('users').doc(req.userId).set({
            encryptedClientId,
            encryptedClientSecret,
            encryptionIV: iv.toString('hex'),
            credentialsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        res.json({ success: true, message: 'Credentials stored successfully' });
    } catch (error) {
        console.error('Store credentials error:', error);
        res.status(500).json({ error: 'Failed to store credentials' });
    }
});

/**
 * GET /api/auth/user/credentials
 * Retrieve decrypted APS credentials for authenticated user
 */
router.get('/user/credentials', verifyFirebaseToken, async (req, res) => {
    try {
        const userDoc = await getDb().collection('users').doc(req.userId).get();
        
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        
        if (!userData.encryptedClientId || !userData.encryptedClientSecret) {
            return res.json({
                success: true,
                credentials: {
                    clientId: '',
                    clientSecret: ''
                }
            });
        }
        
        // Decrypt credentials server-side
        const crypto = require('crypto');
        const algorithm = 'aes-256-cbc';
        const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32bytes', 'utf8').slice(0, 32);
        const iv = Buffer.from(userData.encryptionIV, 'hex');
        
        const decipherClientId = crypto.createDecipheriv(algorithm, key, iv);
        const decipherClientSecret = crypto.createDecipheriv(algorithm, key, iv);
        
        let clientId = decipherClientId.update(userData.encryptedClientId, 'hex', 'utf8');
        clientId += decipherClientId.final('utf8');
        
        let clientSecret = decipherClientSecret.update(userData.encryptedClientSecret, 'hex', 'utf8');
        clientSecret += decipherClientSecret.final('utf8');
        
        res.json({
            success: true,
            credentials: {
                clientId,
                clientSecret
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

module.exports = { router, verifyFirebaseToken, decryptUserCredentials };
