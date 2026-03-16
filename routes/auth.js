const express = require('express');
const router = express.Router();
const apsClient = require('../services/apsClient');
const admin = require('firebase-admin');
const { decryptUserCredentials } = require('./firebaseAuth');

// Store user sessions (in production, use Redis or database)
const sessions = new Map();

/**
 * Initiate 3-legged OAuth flow with user-specific credentials
 */
router.get('/login', async (req, res) => {
    try {
        const { firebaseToken } = req.query;
        
        if (!firebaseToken) {
            return res.status(400).send('Firebase authentication required');
        }
        
        // Check if Firebase is initialized
        try {
            admin.app();
        } catch (error) {
            console.error('Firebase not initialized:', error.message);
            return res.status(500).send(
                'Firebase Admin SDK is not configured. ' +
                'Please download the service account JSON file from Firebase Console and update .env file. ' +
                'See BUILD_INSTRUCTIONS.md for details.'
            );
        }
        
        // Verify Firebase token and get user ID
        const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
        const firebaseUserId = decodedToken.uid;
        
        // Get user's decrypted APS credentials or fall back to default from .env
        let credentials = await decryptUserCredentials(firebaseUserId);
        
        if (!credentials) {
            console.log('No user-specific credentials found, using default APS credentials from .env');
            credentials = {
                clientId: process.env.APS_CLIENT_ID,
                clientSecret: process.env.APS_CLIENT_SECRET
            };
        }
        
        if (!credentials.clientId || !credentials.clientSecret) {
            return res.status(400).send('APS credentials not configured. Please set APS_CLIENT_ID and APS_CLIENT_SECRET in .env');
        }
        
        const state = Math.random().toString(36).substring(7);
        sessions.set(state, {
            timestamp: Date.now(),
            firebaseUserId,
            credentials
        });
        
        // Get authorization URL with user-specific credentials
        const authUrl = apsClient.getAuthorizationUrlForUser(state, credentials.clientId, credentials.clientSecret);
        res.redirect(authUrl);
    } catch (error) {
        console.error('OAuth login error:', error);
        res.status(500).send('Failed to initiate OAuth flow: ' + error.message);
    }
});

/**
 * OAuth callback handler
 */
router.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).send('Authorization code missing');
    }

    const sessionState = sessions.get(state);
    if (!sessionState) {
        return res.status(400).send('Invalid state parameter');
    }

    try {
        // Exchange code for token using user-specific credentials
        const tokenData = await apsClient.get3LeggedTokenForUser(code, sessionState.credentials.clientId, sessionState.credentials.clientSecret);
        
        // Get user profile to get consistent userId
        let userProfile;
        try {
            userProfile = await apsClient.getUserProfile(tokenData.accessToken);
            console.log('User profile retrieved:', userProfile.email || userProfile.userId);
        } catch (profileError) {
            console.error('Failed to get user profile:', profileError);
            // Fallback to sessionId if profile fetch fails
            userProfile = { userId: Math.random().toString(36).substring(7) };
        }
        
        // Store token in session (in production, use secure session storage)
        const sessionId = Math.random().toString(36).substring(7);
        sessions.set(sessionId, {
            ...tokenData,
            userId: userProfile.userId,
            userEmail: userProfile.email,
            firebaseUserId: sessionState.firebaseUserId,
            credentials: sessionState.credentials,
            timestamp: Date.now()
        });
        
        // Also store token in Firestore for scheduled publishing
        // Use Firebase userId for the Firestore document
        const db = admin.firestore();
        
        try {
            const userId = sessionState.firebaseUserId;
            const now = Date.now();
            
            await db.collection('users').doc(userId).set({
                apsToken: tokenData.accessToken,
                apsRefreshToken: tokenData.refreshToken,
                apsTokenExpiry: now + (tokenData.expiresIn * 1000),
                sessionId: sessionId,
                apsUserId: userProfile.userId,
                apsEmail: userProfile.email, // Autodesk email (don't overwrite Firebase email!)
                apsFirstName: userProfile.firstName,
                apsLastName: userProfile.lastName,
                lastLogin: now
            }, { merge: true });
            
            console.log(`Stored tokens in Firestore for Firebase user: ${userId} (APS: ${userProfile.email})`);
        } catch (firestoreError) {
            console.error('Failed to store tokens in Firestore:', firestoreError);
            // Continue even if Firestore storage fails
        }

        // Redirect to frontend with session ID
        res.redirect(`/?session=${sessionId}&success=true`);
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect('/?error=auth_failed&message=' + encodeURIComponent(error.message));
    }
});

/**
 * Get current user session info
 */
router.get('/session/:sessionId', (req, res) => {
    const session = sessions.get(req.params.sessionId);
    
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
        authenticated: true,
        expiresIn: session.expiresIn,
        timestamp: session.timestamp,
        userId: session.firebaseUserId, // Use Firebase userId for Firestore operations
        apsUserId: session.userId, // APS userId
        userEmail: session.userEmail
    });
});

/**
 * Logout
 */
router.post('/logout/:sessionId', (req, res) => {
    sessions.delete(req.params.sessionId);
    res.json({ success: true });
});

/**
 * Middleware to get user token from session
 */
router.getUserToken = (sessionId) => {
    const session = sessions.get(sessionId);
    return session ? session.accessToken : null;
};

/**
 * Get Firebase user ID from session
 */
router.getUserIdFromSession = (sessionId) => {
    const session = sessions.get(sessionId);
    return session ? session.firebaseUserId : null;
};

module.exports = router;
