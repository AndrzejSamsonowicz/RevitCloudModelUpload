/**
 * Admin Tools Routes
 * Special admin-only utilities for maintenance and data fixes
 */

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { verifyFirebaseToken } = require('./firebaseAuth');

/**
 * POST /api/admin/fix-user-emails
 * Restore Firebase emails from Auth to Firestore (fixes Autodesk email overwrite issue)
 */
router.post('/fix-user-emails', verifyFirebaseToken, async (req, res) => {
    try {
        // Check if user is admin
        const userDoc = await admin.firestore().collection('users').doc(req.userId).get();
        if (!userDoc.exists || !userDoc.data().isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        let fixed = 0;
        let skipped = 0;
        let errors = 0;
        const results = [];

        // Get all users from Firestore
        const usersSnapshot = await admin.firestore().collection('users').get();
        
        for (const doc of usersSnapshot.docs) {
            const userId = doc.id;
            const firestoreData = doc.data();
            
            try {
                // Get the correct email from Firebase Auth
                const authUser = await admin.auth().getUser(userId);
                const authEmail = authUser.email;
                const firestoreEmail = firestoreData.email;
                
                // Check if emails don't match (likely overwritten by Autodesk email)
                if (authEmail && authEmail !== firestoreEmail) {
                    // Restore the correct Firebase email
                    await admin.firestore().collection('users').doc(userId).update({
                        email: authEmail,
                        apsEmail: firestoreEmail || admin.firestore.FieldValue.delete() // Move Autodesk email to apsEmail
                    });
                    
                    fixed++;
                    results.push({
                        userId,
                        status: 'fixed',
                        message: `Restored: ${authEmail} (was: ${firestoreEmail})`
                    });
                } else {
                    skipped++;
                    results.push({
                        userId,
                        status: 'skipped',
                        message: `Email already correct: ${authEmail}`
                    });
                }
            } catch (error) {
                errors++;
                results.push({
                    userId,
                    status: 'error',
                    message: error.message
                });
                console.error(`Error fixing user ${userId}:`, error);
            }
        }

        res.json({
            success: true,
            summary: {
                total: usersSnapshot.size,
                fixed,
                skipped,
                errors
            },
            results
        });
    } catch (error) {
        console.error('Fix user emails error:', error);
        res.status(500).json({ error: 'Failed to fix user emails' });
    }
});

/**
 * GET /api/admin/check-user-emails
 * Check which users have mismatched emails (diagnostic tool)
 */
router.get('/check-user-emails', verifyFirebaseToken, async (req, res) => {
    try {
        // Check if user is admin
        const userDoc = await admin.firestore().collection('users').doc(req.userId).get();
        if (!userDoc.exists || !userDoc.data().isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const mismatched = [];
        const correct = [];

        // Get all users from Firestore
        const usersSnapshot = await admin.firestore().collection('users').get();
        
        for (const doc of usersSnapshot.docs) {
            const userId = doc.id;
            const firestoreData = doc.data();
            
            try {
                // Get the correct email from Firebase Auth
                const authUser = await admin.auth().getUser(userId);
                const authEmail = authUser.email;
                const firestoreEmail = firestoreData.email;
                
                if (authEmail !== firestoreEmail) {
                    mismatched.push({
                        userId,
                        authEmail: authEmail,
                        firestoreEmail: firestoreEmail,
                        apsEmail: firestoreData.apsEmail
                    });
                } else {
                    correct.push({
                        userId,
                        email: authEmail
                    });
                }
            } catch (error) {
                console.error(`Error checking user ${userId}:`, error);
            }
        }

        res.json({
            success: true,
            summary: {
                total: usersSnapshot.size,
                mismatched: mismatched.length,
                correct: correct.length
            },
            mismatched,
            correct
        });
    } catch (error) {
        console.error('Check user emails error:', error);
        res.status(500).json({ error: 'Failed to check user emails' });
    }
});

module.exports = router;
