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
            timestamp: Date.now()
        });
        
        // Also store token in Firestore for scheduled publishing
        // Use consistent APS userId instead of temporary sessionId
        const admin = require('firebase-admin');
        const db = admin.firestore();
        
        try {
            const userId = userProfile.userId;
            const now = Date.now();
            
            await db.collection('users').doc(userId).set({
                apsToken: tokenData.accessToken,
                apsRefreshToken: tokenData.refreshToken,
                apsTokenExpiry: now + (tokenData.expiresIn * 1000),
                sessionId: sessionId,
                email: userProfile.email,
                firstName: userProfile.firstName,
                lastName: userProfile.lastName,
                lastLogin: now
            }, { merge: true });
            
            console.log(`Stored tokens in Firestore for user: ${userId} (${userProfile.email})`);
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
        timestamp: session.timestamp,
        userId: session.userId,
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

module.exports = router;
