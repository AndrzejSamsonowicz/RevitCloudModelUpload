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
