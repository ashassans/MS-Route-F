import crypto from 'node:crypto';

// AES-256-GCM requires a 32-byte key
const MASTER_SECRET = process.env.GATEWAY_ENCRYPTION_SECRET || 'nexusgate-secure-default-encryption-key-32b-len';
const KEY = crypto.createHash('sha256').update(MASTER_SECRET).digest();

/**
 * Encrypt sensitive provider API keys using AES-256-GCM with authentication tag.
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  // Format: iv:authTag:encryptedHex
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt sensitive provider API keys.
 */
export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  // Check if payload is in iv:authTag:encrypted format
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    // If not encrypted, return as is (for dev convenience or fallback)
    return encryptedPayload;
  }
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt secret payload:', err);
    return '';
  }
}

/**
 * Generate a cryptographically secure Gateway API key.
 * Format: gw-live-[32-hex-chars]
 */
export function generateGatewayApiKey(): { rawKey: string; keyPrefix: string; keyHash: string } {
  const random = crypto.randomBytes(24).toString('hex');
  const rawKey = `gw-live-${random}`;
  const keyPrefix = `gw-live-${random.slice(0, 6)}...`;
  const keyHash = hashGatewayKey(rawKey);
  return { rawKey, keyPrefix, keyHash };
}

/**
 * Hash a raw API key using SHA-256.
 */
export function hashGatewayKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

/**
 * Mask an API key for safe display (e.g. sk-proj-...a1b2).
 */
export function maskSecret(secret?: string): string {
  if (!secret) return 'Not configured';
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}
