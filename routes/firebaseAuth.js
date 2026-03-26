/**
 * Firebase Authentication Routes
 * Handles user registration, login, email verification, and password reset
 */

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const crypto = require('crypto');
const emailService = require('../services/emailService');

// Helper functions to access Firebase services (initialized in server.js)
const getDb = () => admin.firestore();
const getAuth = () => admin.auth();

/**
 * Input Validation Functions
 */
function validateEmail(email) {
    if (!email || typeof email !== 'string') {
        return { valid: false, error: 'Email is required' };
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'Invalid email format' };
    }
    
    if (email.length > 254) {
        return { valid: false, error: 'Email too long' };
    }
    
    return { valid: true, value: email.toLowerCase().trim() };
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }
    
    if (password.length < 12) {
        return { valid: false, error: 'Password must be at least 12 characters' };
    }
    
    if (password.length > 128) {
        return { valid: false, error: 'Password too long (max 128 characters)' };
    }
    
    // Require complexity
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\\/~`]/.test(password);
    
    if (!(hasUpper && hasLower && hasNumber && hasSpecial)) {
        return { 
            valid: false, 
            error: 'Password must contain uppercase, lowercase, number, and special character' 
        };
    }
    
    return { valid: true };
}

function validateNickname(nickname) {
    if (!nickname || typeof nickname !== 'string') {
        return { valid: false, error: 'Nickname is required' };
    }
    
    const trimmed = nickname.trim();
    if (trimmed.length < 3 || trimmed.length > 64) {
        return { valid: false, error: 'Nickname must be 3-64 characters' };
    }
    
    // Allow only alphanumeric, underscore, hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return { valid: false, error: 'Nickname can only contain letters, numbers, underscore, and hyphen' };
    }
    
    return { valid: true, value: trimmed };
}

function maskCredential(credential) {
    if (!credential || credential.length < 8) return '***';
    return credential.substring(0, 4) + '***' + credential.substring(credential.length - 4);
}


/**
 * Helper function to get encryption key (validates it exists)
 */
function getEncryptionKey() {
    if (!process.env.ENCRYPTION_KEY) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    
    // Expect hex string (64 chars = 32 bytes)
    if (process.env.ENCRYPTION_KEY.length !== 64) {
        throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
    }
    
    return Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
}

/**
 * Helper function to decrypt user credentials
 */
async function decryptUserCredentials(userId) {
    const userDoc = await getDb().collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
        return null;
    }
    
    const userData = userDoc.data();
    
    // Check for new format (single encrypted credentials field)
    if (userData.encryptedCredentials && userData.credentialsIV) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = getEncryptionKey();
            const iv = Buffer.from(userData.credentialsIV, 'hex');
            
            const decipher = crypto.createDecipheriv(algorithm, key, iv);
            
            let decrypted = decipher.update(userData.encryptedCredentials, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            const credentials = JSON.parse(decrypted);
            return { clientId: credentials.clientId, clientSecret: credentials.clientSecret };
        } catch (error) {
            console.error(`Failed to decrypt credentials for user ${userId}:`, error.message);
            console.log('Returning null - user will need to re-enter credentials');
            return null;
        }
    }
    
    // Legacy format (separate encrypted fields) - try to decrypt for backward compatibility
    if (userData.encryptedClientId || userData.encryptedClientSecret) {
        console.log('Found legacy encrypted credentials format - user should re-save credentials');
        return null;
    }
    
    return null;
}

/**
 * Helper function to encrypt user credentials
 */
async function encryptUserCredentials(userId, clientId, clientSecret) {
    try {
        const algorithm = 'aes-256-cbc';
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(16);
        
        // Encrypt both credentials as a single JSON object
        const credentialsJson = JSON.stringify({ clientId, clientSecret });
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        
        let encrypted = cipher.update(credentialsJson, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Save to Firestore using new field names
        await getDb().collection('users').doc(userId).set({
            encryptedCredentials: encrypted,
            credentialsIV: iv.toString('hex'),
            credentialsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        console.log(`Successfully encrypted and saved credentials for user ${userId}`);
        return true;
    } catch (error) {
        console.error(`Failed to encrypt credentials for user ${userId}:`, error.message);
        return false;
    }
}

/**
 * Verify Firebase ID Token Middleware
 * Protects routes that require authentication
 */
async function verifyFirebaseToken(req, res, next) {
    console.log(`[Auth Middleware] Verifying token for: ${req.method} ${req.path}`);
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('[Auth Middleware] No authorization header or invalid format');
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    console.log('[Auth Middleware] Token received, verifying...');
    
    try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        req.user = decodedToken;
        req.userId = decodedToken.uid;
        console.log(`[Auth Middleware] Token verified successfully for user: ${req.userId}`);
        next();
    } catch (error) {
        console.error('[Auth Middleware] Token verification error:', error.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

/**
 * Verify Admin Access Middleware
 * Protects routes that require admin privileges
 */
async function verifyAdminAccess(req, res, next) {
    console.log(`[Admin Middleware] Verifying admin access for: ${req.method} ${req.path}`);
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('[Admin Middleware] No authorization header');
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        req.user = decodedToken;
        req.userId = decodedToken.uid;
        
        // Check if user is admin in Firestore
        const userDoc = await getDb().collection('users').doc(req.userId).get();
        
        if (!userDoc.exists) {
            console.log('[Admin Middleware] User document not found');
            return res.status(403).json({ error: 'Forbidden: User not found' });
        }
        
        const userData = userDoc.data();
        
        if (!userData.isAdmin) {
            console.log(`[Admin Middleware] Access denied for user: ${req.userId}`);
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        
        console.log(`[Admin Middleware] Admin access granted for user: ${req.userId}`);
        next();
    } catch (error) {
        console.error('[Admin Middleware] Admin verification error:', error.message);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
}

/**
 * POST /api/auth/register
 * Register a new user with custom email verification
 */
router.post('/register', async (req, res) => {
    try {
        const { email, password, licenseKey } = req.body;
        
        // Validate email
        const emailValidation = validateEmail(email);
        if (!emailValidation.valid) {
            return res.status(400).json({ error: emailValidation.error });
        }
        
        // Validate password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({ error: passwordValidation.error });
        }
        
        // Create Firebase user (emailVerified will be false initially)
        const userRecord = await getAuth().createUser({
            email: emailValidation.value,
            password: password,
            emailVerified: false
        });
        
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        // Create user document in Firestore
        await getDb().collection('users').doc(userRecord.uid).set({
            email: emailValidation.value,
            licenseKey: licenseKey || null,
            licenseExpiry: null,
            licenseStatus: 'pending',
            emailVerified: false,
            verificationToken: verificationToken,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: null,
            encryptedClientId: '',
            encryptedClientSecret: '',
            encryptionIV: ''
        });
        
        // Send verification email
        let emailSent = false;
        let emailError = null;
        try {
            await emailService.sendVerificationEmail(emailValidation.value, verificationToken);
            console.log(`✅ Verification email sent to: ${maskCredential(emailValidation.value)}`);
            emailSent = true;
        } catch (error) {
            console.error('❌ Failed to send verification email:', error.message);
            emailError = error.message;
            // Don't fail registration if email fails - admin can manually verify
        }
        
        const message = emailSent 
            ? 'Registration successful! Please check your email to verify your account.'
            : 'Registration successful! However, email could not be sent. Please contact admin for manual verification.';
        
        res.json({ 
            success: true, 
            message: message,
            userId: userRecord.uid,
            emailSent: emailSent,
            verificationToken: !emailSent ? verificationToken : undefined // Only return token if email failed (for debugging)
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        if (error.code === 'auth/email-already-exists') {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        res.status(500).json({ error: error.message || 'Registration failed' });
    }
});

/**
 * GET /api/auth/verify-email
 * Verify email using token from verification email
 */
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ error: 'Verification token is required' });
        }
        
        // Find user with this verification token
        const usersSnapshot = await getDb().collection('users')
            .where('verificationToken', '==', token)
            .limit(1)
            .get();
        
        if (usersSnapshot.empty) {
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }
        
        const userDoc = usersSnapshot.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();
        
        // Check if already verified
        if (userData.emailVerified) {
            return res.status(400).json({ error: 'Email already verified' });
        }
        
        // Update Firebase Auth user
        await getAuth().updateUser(userId, {
            emailVerified: true
        });
        
        // Update Firestore user document
        await getDb().collection('users').doc(userId).update({
            emailVerified: true,
            verificationToken: admin.firestore.FieldValue.delete(),
            verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`Email verified for user: ${userId} (${userData.email})`);
        
        res.json({ 
            success: true, 
            message: 'Email verified successfully! You can now log in.',
            email: userData.email
        });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: 'Email verification failed' });
    }
});

/**
 * POST /api/auth/resend-verification
 * Resend verification email
 */
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Find user by email
        const userRecord = await getAuth().getUserByEmail(email);
        
        // Check if already verified
        if (userRecord.emailVerified) {
            return res.status(400).json({ error: 'Email already verified' });
        }
        
        // Get user document (or create if doesn't exist)
        const userDoc = await getDb().collection('users').doc(userRecord.uid).get();
        
        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        // Store/update token in Firestore (create document if it doesn't exist)
        await getDb().collection('users').doc(userRecord.uid).set({
            email: email, // Ensure email is stored
            verificationToken: verificationToken,
            verificationResent: admin.firestore.FieldValue.serverTimestamp(),
            emailVerified: false
        }, { merge: true });
        
        // Send verification email
        let emailSent = false;
        try {
            await emailService.sendVerificationEmail(email, verificationToken);
            console.log(`✅ Verification email resent to: ${email}`);
            emailSent = true;
        } catch (emailError) {
            console.error('❌ Failed to resend verification email:', emailError);
        }
        
        const message = emailSent
            ? 'Verification email sent! Please check your inbox.'
            : 'Token generated but email could not be sent. Please contact admin or check server logs.';
        
        res.json({ 
            success: true, 
            message: message,
            emailSent: emailSent,
            verificationToken: !emailSent ? verificationToken : undefined // Only return token if email failed (for debugging)
        });
    } catch (error) {
        console.error('Resend verification error:', error);
        
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ error: 'No account found with this email' });
        }
        
        res.status(500).json({ error: 'Failed to resend verification email' });
    }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset (custom implementation)
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Check if user exists
        let userRecord;
        try {
            userRecord = await getAuth().getUserByEmail(email);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                // Don't reveal if email exists for security reasons
                return res.json({ 
                    success: true, 
                    message: 'If an account exists with this email, a password reset link will be sent.'
                });
            }
            throw error;
        }
        
        // Generate password reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = Date.now() + 3600000; // 1 hour from now
        
        // Store reset token in Firestore (create document if it doesn't exist)
        await getDb().collection('users').doc(userRecord.uid).set({
            email: email, // Ensure email is stored
            passwordResetToken: resetToken,
            passwordResetExpiry: resetExpiry,
            passwordResetRequestedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Build reset URL
        const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${resetToken}`;
        
        // Send password reset email
        let emailSent = false;
        try {
            await emailService.sendPasswordResetEmail(email, resetUrl);
            console.log(`✅ Password reset email sent to: ${email}`);
            emailSent = true;
        } catch (emailError) {
            console.error('❌ Failed to send password reset email:', emailError);
        }
        
        const message = emailSent
            ? 'Password reset email sent! Check your inbox.'
            : 'Reset token generated but email could not be sent. Please contact admin.';
        
        res.json({ 
            success: true, 
            message: message,
            emailSent: emailSent,
            resetToken: !emailSent ? resetToken : undefined // Only return token if email failed (for debugging)
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token (custom implementation)
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }
        
        // Validate password strength
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        
        // Find user with this reset token
        const usersSnapshot = await getDb().collection('users')
            .where('passwordResetToken', '==', token)
            .limit(1)
            .get();
        
        if (usersSnapshot.empty) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }
        
        const userDoc = usersSnapshot.docs[0];
        const userId = userDoc.id;
        const userData = userDoc.data();
        
        // Check if token has expired
        if (!userData.passwordResetExpiry || Date.now() > userData.passwordResetExpiry) {
            return res.status(400).json({ error: 'Reset token has expired. Please request a new password resetreset.' });
        }
        
        // Update password in Firebase Auth
        await getAuth().updateUser(userId, {
            password: newPassword
        });
        
        // Remove reset token from Firestore
        await getDb().collection('users').doc(userId).update({
            passwordResetToken: admin.firestore.FieldValue.delete(),
            passwordResetExpiry: admin.firestore.FieldValue.delete(),
            passwordResetAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`Password reset successful for user: ${userId} (${userData.email})`);
        
        res.json({ 
            success: true, 
            message: 'Password reset successfully! You can now log in with your new password.',
            email: userData.email
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

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
 * PUT /api/auth/user/credentials
 * Store APS credentials for authenticated user (server-side encryption)
 */
router.put('/user/credentials', verifyFirebaseToken, async (req, res) => {
    try {
        const { clientId, clientSecret } = req.body;
        
        console.log(`[Credentials] Saving credentials for user: ${req.userId}`);
        
        if (!clientId || !clientSecret) {
            console.log('[Credentials] Missing required fields');
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Validate credentials format
        if (typeof clientId !== 'string' || typeof clientSecret !== 'string') {
            return res.status(400).json({ error: 'Invalid credential format' });
        }
        
        if (clientId.trim().length < 10 || clientSecret.trim().length < 10) {
            return res.status(400).json({ error: 'Credentials appear to be too short' });
        }
        
        // Use the encryption helper function to encrypt and store
        await encryptUserCredentials(req.userId, clientId.trim(), clientSecret.trim());
        
        console.log(`[Credentials] Successfully saved credentials for user: ${req.userId}`);
        
        res.json({ success: true, message: 'Credentials stored successfully' });
    } catch (error) {
        console.error('[Credentials] Store credentials error:', error);
        res.status(500).json({ error: 'Failed to store credentials', details: error.message });
    }
});

/**
 * GET /api/auth/user/credentials
 * Retrieve decrypted APS credentials for authenticated user
 */
router.get('/user/credentials', verifyFirebaseToken, async (req, res) => {
    console.log('[Credentials GET] Route handler called!');
    console.log('[Credentials GET] req.userId:', req.userId);
    
    try {
        console.log(`[Credentials] Loading credentials for user: ${req.userId}`);
        
        const userDoc = await getDb().collection('users').doc(req.userId).get();
        
        if (!userDoc.exists) {
            console.log(`[Credentials] User document not found - returning empty credentials`);
            return res.json({
                success: true,
                credentials: {
                    clientId: '',
                    clientSecret: ''
                }
            });
        }
        
        const userData = userDoc.data();
        
        // Try to decrypt using the decryptUserCredentials helper function
        try {
            const credentials = await decryptUserCredentials(req.userId);
            
            if (credentials && credentials.clientId && credentials.clientSecret) {
                console.log(`[Credentials] Successfully decrypted credentials`);
                return res.json({
                    success: true,
                    credentials: {
                        clientId: credentials.clientId,
                        clientSecret: credentials.clientSecret
                    }
                });
            }
        } catch (decryptError) {
            console.warn('[Credentials] Decryption failed (old/corrupted credentials):', decryptError.message);
            console.log('[Credentials] Returning empty credentials - user will need to re-enter them');
        }
        
        // No credentials or decryption failed - return empty
        return res.json({
            success: true,
            credentials: {
                clientId: '',
                clientSecret: ''
            }
        });
    } catch (error) {
        console.error('[Credentials] Get credentials error:', error);
        // Even on error, return empty credentials so modal can open
        return res.json({
            success: true,
            credentials: {
                clientId: '',
                clientSecret: ''
            }
        });
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

module.exports = { router, verifyFirebaseToken, verifyAdminAccess, decryptUserCredentials, encryptUserCredentials };
