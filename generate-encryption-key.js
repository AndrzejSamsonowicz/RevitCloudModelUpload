/**
 * Generate Encryption Key for Scheduled Publishing Data
 * Run this ONCE during initial setup
 */

const crypto = require('crypto');

function generateEncryptionKey() {
    const key = crypto.randomBytes(32); // 256 bits
    return {
        hex: key.toString('hex'),
        base64: key.toString('base64')
    };
}

console.log('\n========================================');
console.log('  ENCRYPTION KEY GENERATOR');
console.log('========================================\n');

const key = generateEncryptionKey();

console.log('Generated encryption key:');
console.log('');
console.log('HEX FORMAT (recommended):');
console.log(key.hex);
console.log('');
console.log('BASE64 FORMAT:');
console.log(key.base64);
console.log('');

console.log('========================================');
console.log('  SETUP INSTRUCTIONS');
console.log('========================================\n');

console.log('1. BACKEND SERVER (VM):');
console.log('   Add to your .env file or environment variables:');
console.log('');
console.log(`   ENCRYPTION_KEY=${key.hex}`);
console.log('');
console.log('   Then restart the server: pm2 restart revit-publisher');
console.log('');

console.log('2. FIREBASE CLOUD FUNCTIONS:');
console.log('   Set the encryption key in Firebase config:');
console.log('');
console.log(`   firebase functions:config:set encryption.key="${key.hex}"`);
console.log('');
console.log('   Then redeploy functions: firebase deploy --only functions');
console.log('');

console.log('========================================');
console.log('  IMPORTANT NOTES');
console.log('========================================\n');

console.log('⚠️  SECURITY WARNING:');
console.log('   - Store this key securely!');
console.log('   - Never commit it to Git');
console.log('   - If lost, all encrypted data cannot be decrypted');
console.log('   - Backup this key in a secure location (password manager)');
console.log('');

console.log('📝 WHAT GETS ENCRYPTED:');
console.log('   - File names in scheduled publishing');
console.log('   - Project names in scheduled publishing');
console.log('');

console.log('🔄 MIGRATION:');
console.log('   - Existing unencrypted schedules will be encrypted on next save');
console.log('   - System handles both encrypted and unencrypted data gracefully');
console.log('');

console.log('========================================\n');
