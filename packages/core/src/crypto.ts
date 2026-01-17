import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const MIN_KEY_LENGTH = 32;
const SALT = 'orient-master-key';

// Default development key - ONLY used when ORIENT_MASTER_KEY is not set
// In production, always set ORIENT_MASTER_KEY to a secure random value
const DEV_MASTER_KEY = 'orient-dev-master-key-do-not-use-in-production-32chars';

export function getMasterKey(): Buffer {
  const key = process.env.ORIENT_MASTER_KEY;
  if (!key || key.length < MIN_KEY_LENGTH) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`ORIENT_MASTER_KEY must be at least ${MIN_KEY_LENGTH} characters`);
    }
    // Use default development key for local development
    return crypto.scryptSync(DEV_MASTER_KEY, SALT, 32);
  }
  return crypto.scryptSync(key, SALT, 32);
}

export function encryptSecret(plaintext: string): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const key = getMasterKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

export function decryptSecret(encrypted: string, ivHex: string, authTagHex: string): string {
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
