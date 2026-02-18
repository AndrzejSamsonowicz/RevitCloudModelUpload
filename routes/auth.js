const express = require('express');
const router = express.Router();
const apsClient = require('../services/apsClient');

// Store user sessions (in production, use Redis or database)
const sessions = new Map();

/**
 * Initiate 3-legged OAuth flow
 */
router.get('/login', (req, res) => {
    const state = Math.random().toString(36).substring(7);
    sessions.set(state, { timestamp: Date.now() });
    
    const authUrl = apsClient.getAuthorizationUrl(state);
    res.redirect(authUrl);
});

/**
 * OAuth callback handler
 */
router.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).send('Authorization code missing');
    }

    if (!sessions.has(state)) {
        return res.status(400).send('Invalid state parameter');
    }

    try {
        const tokenData = await apsClient.get3LeggedToken(code);
        
        // Store token in session (in production, use secure session storage)
        const sessionId = Math.random().toString(36).substring(7);
        sessions.set(sessionId, {
            ...tokenData,
            timestamp: Date.now()
        });
        
        // Also store token in Firestore for scheduled publishing
        // Get user info from APS to identify the user
        const admin = require('firebase-admin');
        const db = admin.firestore();
        
        try {
            // Use sessionId as userId for now (in production, get actual user email from APS)
            const userId = sessionId;
            const now = Date.now();
            
            await db.collection('users').doc(userId).set({
                apsToken: tokenData.accessToken,
                apsRefreshToken: tokenData.refreshToken,
                apsTokenExpiry: now + (tokenData.expiresIn * 1000),
                sessionId: sessionId,
                lastLogin: now,
                publishingSchedules: [] // Initialize empty schedules array
            }, { merge: true });
            
            console.log(`Stored tokens in Firestore for user: ${userId}`);
        } catch (firestoreError) {
            console.error('Failed to store tokens in Firestore:', firestoreError);
            // Continue even if Firestore storage fails
        }

        // Redirect to frontend with session ID
        res.redirect(`/?session=${sessionId}&success=true`);
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.redirect('/?error=auth_failed');
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
        timestamp: session.timestamp
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

module.exports = router;
