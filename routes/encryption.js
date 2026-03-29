/**
 * Encryption API Routes
 * Provides encryption/decryption services for frontend
 */

const express = require('express');
const router = express.Router();
const { encryptSchedules, decryptSchedules, generateEncryptionKey } = require('../services/encryption');

/**
 * POST /api/encryption/encrypt-schedules
 * Encrypts an array of schedules
 */
router.post('/encrypt-schedules', async (req, res) => {
    try {
        const { schedules } = req.body;
        
        if (!Array.isArray(schedules)) {
            return res.status(400).json({ 
                error: 'Invalid request', 
                message: 'schedules must be an array' 
            });
        }
        
        const encrypted = encryptSchedules(schedules);
        
        res.json({ 
            success: true, 
            schedules: encrypted 
        });
        
    } catch (error) {
        console.error('Error encrypting schedules:', error);
        res.status(500).json({ 
            error: 'Encryption failed', 
            message: error.message 
        });
    }
});

/**
 * POST /api/encryption/decrypt-schedules
 * Decrypts an array of schedules
 */
router.post('/decrypt-schedules', async (req, res) => {
    try {
        const { schedules } = req.body;
        
        if (!Array.isArray(schedules)) {
            return res.status(400).json({ 
                error: 'Invalid request', 
                message: 'schedules must be an array' 
            });
        }
        
        const decrypted = decryptSchedules(schedules);
        
        res.json({ 
            success: true, 
            schedules: decrypted 
        });
        
    } catch (error) {
        console.error('Error decrypting schedules:', error);
        res.status(500).json({ 
            error: 'Decryption failed', 
            message: error.message 
        });
    }
});

/**
 * GET /api/encryption/generate-key (ADMIN ONLY - for initial setup)
 * Generates a new encryption key
 * WARNING: This should only be used once during setup and then removed/disabled
 */
router.get('/generate-key', (req, res) => {
    // Only allow in development mode
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ 
            error: 'Forbidden', 
            message: 'Key generation is disabled in production' 
        });
    }
    
    const key = generateEncryptionKey();
    
    res.json({
        success: true,
        message: 'Save this key to your environment variables as ENCRYPTION_KEY',
        key: key,
        instructions: [
            '1. Copy the hex or base64 key value',
            '2. Add to .env file: ENCRYPTION_KEY=<key_value>',
            '3. Restart the server',
            '4. For Cloud Functions: Add to Firebase environment config',
            '   firebase functions:config:set encryption.key="<key_value>"'
        ]
    });
});

module.exports = router;
