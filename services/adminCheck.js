/**
 * Admin check — single source of truth for "is this user an admin?".
 *
 * Model: a user is an admin iff a document exists at `admins/{uid}` in Firestore.
 * The document's fields don't matter (existence is the signal). This matches the
 * ACC_User_Management / forma-user-management app so both apps share one model.
 *
 * Grant admin:  create `admins/{uid}` (see set-admin.js)
 * Revoke admin: delete `admins/{uid}`
 */

const admin = require('firebase-admin');

/**
 * @param {string} uid Firebase Auth UID
 * @returns {Promise<boolean>}
 */
async function isAdmin(uid) {
    if (!uid) return false;
    const doc = await admin.firestore().collection('admins').doc(uid).get();
    return doc.exists;
}

module.exports = { isAdmin };
