/**
 * Encryption Service for Sensitive Data
 * Uses AES-256-GCM for encryption/decryption
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get encryption key from environment or generate one
 * IMPORTANT: Set ENCRYPTION_KEY in environment variables
 */
function getEncryptionKey() {
    const key = process.env.ENCRYPTION_KEY;
    
    if (!key) {
        console.warn('⚠️ ENCRYPTION_KEY not set in environment. Using fallback (NOT SECURE for production)');
        // Fallback key - MUST be replaced with secure key in production
        return Buffer.from('12345678901234567890123456789012'); // 32 bytes
    }
    
    // If key is hex string, convert to buffer
    if (key.length === 64) {
        return Buffer.from(key, 'hex');
    }
    
    // If key is base64 string
    if (key.length === 44 && key.includes('+') || key.includes('/')) {
        return Buffer.from(key, 'base64');
    }
    
    // Otherwise, pad or hash to ensure 32 bytes
    const hash = crypto.createHash('sha256').update(key).digest();
    return hash;
}

/**
 * Encrypt a string value
 * @param {string} plaintext - Text to encrypt
 * @returns {string} - Encrypted value in format: iv:authTag:ciphertext (all hex)
 */
function encrypt(plaintext) {
    if (!plaintext) {
        return plaintext; // Don't encrypt empty values
    }
    
    try {
        const key = getEncryptionKey();
        const iv = crypto.randomBytes(IV_LENGTH);
        
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        
        let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
        ciphertext += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        // Return format: iv:authTag:ciphertext
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
    } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Failed to encrypt data');
    }
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
        // Not encrypted or wrong format, return as-is
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
        return encryptedValue;
    }
}

/**
 * Encrypt sensitive fields in a schedule object
 * @param {Object} schedule - Schedule object
 * @returns {Object} - Schedule with encrypted fields
 */
function encryptSchedule(schedule) {
    return {
        ...schedule,
        fileName: encrypt(schedule.fileName),
        projectName: encrypt(schedule.projectName)
    };
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
 * Encrypt array of schedules
 * @param {Array} schedules - Array of schedule objects
 * @returns {Array} - Array of schedules with encrypted fields
 */
function encryptSchedules(schedules) {
    return schedules.map(encryptSchedule);
}

/**
 * Decrypt array of schedules
 * @param {Array} schedules - Array of schedule objects with encrypted fields
 * @returns {Array} - Array of schedules with decrypted fields
 */
function decryptSchedules(schedules) {
    return schedules.map(decryptSchedule);
}

/**
 * Generate a new encryption key (for initial setup)
 * Run this once and save the key to environment variables
 */
function generateEncryptionKey() {
    const key = crypto.randomBytes(KEY_LENGTH);
    return {
        hex: key.toString('hex'),
        base64: key.toString('base64')
    };
}

module.exports = {
    encrypt,
    decrypt,
    encryptSchedule,
    decryptSchedule,
    encryptSchedules,
    decryptSchedules,
    generateEncryptionKey
};
