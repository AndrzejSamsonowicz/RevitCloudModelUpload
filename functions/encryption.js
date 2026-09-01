/**
 * Encryption Service for Cloud Functions
 * Uses AES-256-GCM for encryption/decryption
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
// const KEY_LENGTH = 32; // 256 bits (not used in Cloud Functions - only decrypt)
// const IV_LENGTH = 16; // 128 bits (not used in Cloud Functions - only decrypt)
// const AUTH_TAG_LENGTH = 16; // 128 bits (not used in Cloud Functions - only decrypt)

/**
 * Get encryption key from the Cloud Functions environment (functions/.env).
 * MUST match the VM server's ENCRYPTION_KEY, or scheduled-publish schedules
 * (fileName / projectName are encrypted) can't be decrypted here.
 */
function getEncryptionKey() {
    const keyConfig = process.env.ENCRYPTION_KEY;

    if (!keyConfig) {
        console.warn('⚠️ ENCRYPTION_KEY not set in the Cloud Functions environment (functions/.env)');

        // Fallback key for development - MUST match server.js fallback
        return Buffer.from('12345678901234567890123456789012'); // 32 bytes
    }
    
    // If key is hex string, convert to buffer
    if (keyConfig.length === 64) {
        return Buffer.from(keyConfig, 'hex');
    }
    
    // If key is base64 string
    if (keyConfig.length === 44 && (keyConfig.includes('+') || keyConfig.includes('/'))) {
        return Buffer.from(keyConfig, 'base64');
    }
    
    // Otherwise, hash to ensure 32 bytes
    const hash = crypto.createHash('sha256').update(keyConfig).digest();
    return hash;
}

/**
 * Decrypt an encrypted string value
 * @param {string} encryptedValue - Encrypted value in format: iv:authTag:ciphertext
 * @returns {string} - Decrypted plaintext
 */
function decrypt(encryptedValue) {
    if (!encryptedValue || typeof encryptedValue !== 'string') {
        return encryptedValue; // Return as-is if not encrypted
    }
    
    // Check if value is encrypted (has the format iv:authTag:ciphertext)
    const parts = encryptedValue.split(':');
    if (parts.length !== 3) {
        // Not encrypted or wrong format, return as-is (legacy unencrypted data)
        return encryptedValue;
    }
    
    try {
        const key = getEncryptionKey();
        const [ivHex, authTagHex, ciphertext] = parts;
        
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
        plaintext += decipher.final('utf8');
        
        return plaintext;
    } catch (error) {
        console.error('Decryption error:', error);
        // Return the original value if decryption fails (might be legacy unencrypted data)
        console.warn('Failed to decrypt value, returning as-is (might be legacy data)');
        return encryptedValue;
    }
}

/**
 * Decrypt sensitive fields in a schedule object
 * @param {Object} schedule - Schedule object with encrypted fields
 * @returns {Object} - Schedule with decrypted fields
 */
function decryptSchedule(schedule) {
    return {
        ...schedule,
        fileName: decrypt(schedule.fileName),
        projectName: decrypt(schedule.projectName)
    };
}

/**
 * Decrypt array of schedules
 * @param {Array} schedules - Array of schedule objects with encrypted fields
 * @returns {Array} - Array of schedules with decrypted fields
 */
function decryptSchedules(schedules) {
    if (!Array.isArray(schedules)) {
        return schedules;
    }
    return schedules.map(decryptSchedule);
}

module.exports = {
    decrypt,
    decryptSchedule,
    decryptSchedules
};
