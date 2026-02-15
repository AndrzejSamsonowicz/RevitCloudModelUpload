/**
 * License Management Routes
 * Handles license purchases, validation, activation, and administration
 */

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const crypto = require('crypto');

// Helper function to access Firebase services (initialized in server.js)
const getDb = () => admin.firestore();
const { verifyFirebaseToken } = require('./firebaseAuth');

// PayPal SDK (install with: npm install @paypal/checkout-server-sdk)
const paypal = require('@paypal/checkout-server-sdk');

// PayPal environment configuration
function getPayPalEnvironment() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    
    if (process.env.PAYPAL_MODE === 'live') {
        return new paypal.core.LiveEnvironment(clientId, clientSecret);
    } else {
        return new paypal.core.SandboxEnvironment(clientId, clientSecret);
    }
}

const paypalClient = new paypal.core.PayPalHttpClient(getPayPalEnvironment());

/**
 * Generate a unique license key
 */
function generateLicenseKey() {
    const segments = [];
    for (let i = 0; i < 4; i++) {
        const segment = crypto.randomBytes(2).toString('hex').toUpperCase();
        segments.push(segment);
    }
    return segments.join('-');
}

/**
 * POST /api/create-license-order
 * Create a PayPal order and generate license key
 */
router.post('/create-license-order', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Generate license key
        const licenseKey = generateLicenseKey();
        
        // Create PayPal order
        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [{
                description: 'Revit Cloud Model Publisher - Annual License',
                amount: {
                    currency_code: 'EUR',
                    value: '900.00'
                },
                custom_id: licenseKey // Store license key in custom_id
            }],
            application_context: {
                brand_name: 'Revit Cloud Model Publisher',
                user_action: 'PAY_NOW',
                return_url: `${process.env.APS_CALLBACK_URL || 'http://localhost:3000'}/payment-success`,
                cancel_url: `${process.env.APS_CALLBACK_URL || 'http://localhost:3000'}/payment-cancel`
            }
        });
        
        const order = await paypalClient.execute(request);
        
        // Store pending license in Firestore
        await getDb().collection('licenses').doc(licenseKey).set({
            licenseKey,
            email,
            status: 'pending',
            paypalOrderId: order.result.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiryDate: null,
            userId: null
        });
        
        res.json({
            success: true,
            orderId: order.result.id,
            licenseKey
        });
        
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

/**
 * POST /api/capture-license-payment
 * Capture PayPal payment and activate license
 */
router.post('/capture-license-payment', async (req, res) => {
    try {
        const { orderId, licenseKey, email } = req.body;
        
        if (!orderId || !licenseKey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Capture the payment
        const request = new paypal.orders.OrdersCaptureRequest(orderId);
        const capture = await paypalClient.execute(request);
        
        if (capture.result.status !== 'COMPLETED') {
            return res.status(400).json({ error: 'Payment not completed' });
        }
        
        // Calculate expiry date (1 year from now)
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        
        // Update license status
        await getDb().collection('licenses').doc(licenseKey).update({
            status: 'active',
            paypalCaptureId: capture.result.id,
            activatedAt: admin.firestore.FieldValue.serverTimestamp(),
            expiryDate: expiryDate.toISOString(),
            paymentDetails: {
                amount: capture.result.purchase_units[0].amount.value,
                currency: capture.result.purchase_units[0].amount.currency_code,
                payerId: capture.result.payer.payer_id,
                payerEmail: capture.result.payer.email_address
            }
        });
        
        // Log payment in analytics
        await getDb().collection('analytics').add({
            type: 'payment',
            licenseKey,
            email,
            amount: parseFloat(capture.result.purchase_units[0].amount.value),
            currency: capture.result.purchase_units[0].amount.currency_code,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // TODO: Send email with license key
        
        res.json({
            success: true,
            licenseKey,
            email,
            expiryDate: expiryDate.toISOString(),
            message: 'Payment successful! License activated.'
        });
        
    } catch (error) {
        console.error('Capture payment error:', error);
        res.status(500).json({ error: 'Failed to capture payment' });
    }
});

/**
 * POST /api/validate-license
 * Validate license key and email
 */
router.post('/validate-license', async (req, res) => {
    try {
        const { licenseKey, email } = req.body;
        
        if (!licenseKey || !email) {
            return res.status(400).json({ error: 'License key and email are required' });
        }
        
        // Get license from Firestore
        const licenseDoc = await getDb().collection('licenses').doc(licenseKey).get();
        
        if (!licenseDoc.exists) {
            return res.status(404).json({ error: 'Invalid license key' });
        }
        
        const licenseData = licenseDoc.data();
        
        // Check if email matches
        if (licenseData.email.toLowerCase() !== email.toLowerCase()) {
            return res.status(403).json({ error: 'License key does not match email' });
        }
        
        // Check license status
        if (licenseData.status === 'revoked') {
            return res.status(403).json({ error: 'License has been revoked' });
        }
        
        if (licenseData.status === 'pending') {
            return res.status(403).json({ error: 'License payment is pending' });
        }
        
        // Check expiry
        if (licenseData.expiryDate && new Date(licenseData.expiryDate) < new Date()) {
            return res.status(403).json({ error: 'License has expired' });
        }
        
        res.json({
            success: true,
            licenseKey,
            status: licenseData.status,
            expiryDate: licenseData.expiryDate,
            message: 'License is valid'
        });
        
    } catch (error) {
        console.error('Validate license error:', error);
        res.status(500).json({ error: 'Failed to validate license' });
    }
});

/**
 * POST /api/admin/activate-license
 * Manually activate a license for a user (admin only)
 */
router.post('/admin/activate-license', verifyFirebaseToken, async (req, res) => {
    try {
        // Check if requester is admin
        const adminDoc = await getDb().collection('users').doc(req.userId).get();
        if (!adminDoc.exists || !adminDoc.data().isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        
        const { userId, licenseKey, durationMonths = 12 } = req.body;
        
        if (!userId || !licenseKey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Get user
        const userDoc = await getDb().collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userData = userDoc.data();
        
        // Check if license exists
        const licenseDoc = await getDb().collection('licenses').doc(licenseKey).get();
        
        if (!licenseDoc.exists) {
            return res.status(404).json({ error: 'License not found' });
        }
        
        // Calculate expiry date
        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + durationMonths);
        
        // Update license
        await getDb().collection('licenses').doc(licenseKey).update({
            userId,
            email: userData.email,
            status: 'active',
            expiryDate: expiryDate.toISOString(),
            activatedBy: 'admin',
            activatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Update user
        await getDb().collection('users').doc(userId).update({
            licenseKey,
            licenseStatus: 'active',
            licenseExpiry: expiryDate.toISOString(),
            licenseActivatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({
            success: true,
            message: 'License activated successfully',
            expiryDate: expiryDate.toISOString()
        });
        
    } catch (error) {
        console.error('Activate license error:', error);
        res.status(500).json({ error: 'Failed to activate license' });
    }
});

/**
 * POST /api/admin/deactivate-license
 * Deactivate a user's license (admin only)
 */
router.post('/admin/deactivate-license', verifyFirebaseToken, async (req, res) => {
    try {
        // Check if requester is admin
        const adminDoc = await getDb().collection('users').doc(req.userId).get();
        if (!adminDoc.exists || !adminDoc.data().isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        
        const { userId, licenseKey } = req.body;
        
        if (!userId || !licenseKey) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Update license
        await getDb().collection('licenses').doc(licenseKey).update({
            status: 'inactive',
            deactivatedBy: 'admin',
            deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Update user
        await getDb().collection('users').doc(userId).update({
            licenseStatus: 'inactive',
            licenseDeactivatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({
            success: true,
            message: 'License deactivated successfully'
        });
        
    } catch (error) {
        console.error('Deactivate license error:', error);
        res.status(500).json({ error: 'Failed to deactivate license' });
    }
});

/**
 * GET /api/admin/licenses
 * Get all licenses (admin only)
 */
router.get('/admin/licenses', verifyFirebaseToken, async (req, res) => {
    try {
        // Check if requester is admin
        const adminDoc = await getDb().collection('users').doc(req.userId).get();
        if (!adminDoc.exists || !adminDoc.data().isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        
        const licensesSnapshot = await getDb().collection('licenses').orderBy('createdAt', 'desc').get();
        
        const licenses = [];
        licensesSnapshot.forEach(doc => {
            const data = doc.data();
            licenses.push({
                licenseKey: doc.id,
                email: data.email,
                status: data.status,
                userId: data.userId || null,
                expiryDate: data.expiryDate || null,
                createdAt: data.createdAt?.toDate().toISOString() || null,
                activatedAt: data.activatedAt?.toDate().toISOString() || null
            });
        });
        
        res.json({
            success: true,
            licenses
        });
        
    } catch (error) {
        console.error('Get licenses error:', error);
        res.status(500).json({ error: 'Failed to get licenses' });
    }
});

/**
 * GET /api/admin/users
 * Get all users (admin only)
 */
router.get('/admin/users', verifyFirebaseToken, async (req, res) => {
    try {
        // Check if requester is admin
        const adminDoc = await getDb().collection('users').doc(req.userId).get();
        if (!adminDoc.exists || !adminDoc.data().isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        
        const usersSnapshot = await getDb().collection('users').orderBy('createdAt', 'desc').get();
        
        const users = [];
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            users.push({
                userId: doc.id,
                email: data.email,
                licenseKey: data.licenseKey || null,
                licenseStatus: data.licenseStatus || 'none',
                licenseExpiry: data.licenseExpiry || null,
                isAdmin: data.isAdmin || false,
                createdAt: data.createdAt?.toDate().toISOString() || null,
                lastLogin: data.lastLogin?.toDate().toISOString() || null
            });
        });
        
        res.json({
            success: true,
            users
        });
        
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

/**
 * DELETE /api/admin/users/:userId
 * Delete a user (admin only)
 */
router.delete('/admin/users/:userId', verifyFirebaseToken, async (req, res) => {
    try {
        // Check if requester is admin
        const adminDoc = await getDb().collection('users').doc(req.userId).get();
        if (!adminDoc.exists || !adminDoc.data().isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        
        const { userId } = req.params;
        
        // Don't allow deleting yourself
        if (userId === req.userId) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        
        // Delete user from Firestore
        await getDb().collection('users').doc(userId).delete();
        
        // Delete user from Firebase Auth
        try {
            await admin.auth().deleteUser(userId);
        } catch (authError) {
            console.error('Failed to delete user from Auth:', authError);
            // Continue even if auth deletion fails
        }
        
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
        
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * GET /api/admin/analytics
 * Get analytics data (admin only)
 */
router.get('/admin/analytics', verifyFirebaseToken, async (req, res) => {
    try {
        // Check if requester is admin
        const adminDoc = await getDb().collection('users').doc(req.userId).get();
        if (!adminDoc.exists || !adminDoc.data().isAdmin) {
            return res.status(403).json({ error: 'Forbidden: Admin access required' });
        }
        
        const analyticsSnapshot = await getDb().collection('analytics').orderBy('timestamp', 'desc').limit(100).get();
        
        const analytics = [];
        analyticsSnapshot.forEach(doc => {
            const data = doc.data();
            analytics.push({
                id: doc.id,
                type: data.type,
                email: data.email || null,
                licenseKey: data.licenseKey || null,
                amount: data.amount || null,
                currency: data.currency || null,
                timestamp: data.timestamp?.toDate().toISOString() || null
            });
        });
        
        res.json({
            success: true,
            analytics
        });
        
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

module.exports = router;

