/**
 * Cryptographic Utilities
 *
 * Provides encryption, decryption, and cryptographic helper functions
 * for secure data handling.
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ENCODING: BufferEncoding = 'base64';

/**
 * Generates a cryptographically secure UUID v4.
 *
 * @returns UUID string
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generates secure random bytes.
 *
 * @param length - Number of bytes to generate
 * @returns Buffer of random bytes
 */
export function randomBytes(length: number): Buffer {
  return crypto.randomBytes(length);
}

/**
 * Encrypts data using AES-256-GCM.
 *
 * Security features:
 * - AES-256 encryption for strong protection
 * - GCM mode for authenticated encryption
 * - Random IV for each encryption
 * - Authentication tag prevents tampering
 *
 * @param plaintext - Data to encrypt
 * @param key - 32-byte encryption key
 * @returns Encrypted data in format: iv$authTag$ciphertext (base64)
 */
export function encrypt(plaintext: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag();

  // Combine IV, auth tag, and ciphertext
  return `${iv.toString(ENCODING)}$${authTag.toString(ENCODING)}$${encrypted}`;
}

/**
 * Decrypts data encrypted with encrypt().
 *
 * @param ciphertext - Encrypted data in format: iv$authTag$ciphertext
 * @param key - 32-byte encryption key
 * @returns Decrypted plaintext
 */
export function decrypt(ciphertext: string, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }

  const [ivB64, authTagB64, encrypted] = ciphertext.split('$');

  if (!ivB64 || !authTagB64 || !encrypted) {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(ivB64, ENCODING);
  const authTag = Buffer.from(authTagB64, ENCODING);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypts an object as JSON.
 *
 * @param data - Object to encrypt
 * @param key - Encryption key
 * @returns Encrypted string
 */
export function encryptObject<T>(data: T, key: Buffer): string {
  const json = JSON.stringify(data);
  return encrypt(json, key);
}

/**
 * Decrypts an encrypted object.
 *
 * @param ciphertext - Encrypted data
 * @param key - Encryption key
 * @returns Decrypted object
 */
export function decryptObject<T>(ciphertext: string, key: Buffer): T {
  const json = decrypt(ciphertext, key);
  return JSON.parse(json);
}

/**
 * Generates a secure encryption key.
 *
 * @returns 32-byte Buffer suitable for AES-256
 */
export function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Derives an encryption key from a password.
 *
 * Uses PBKDF2 with high iteration count for security.
 *
 * @param password - Password to derive key from
 * @param salt - Salt value (should be random and stored)
 * @returns 32-byte encryption key
 */
export async function deriveEncryptionKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Generates a secure random string.
 *
 * @param length - Desired string length
 * @param charset - Characters to use (default: alphanumeric)
 * @returns Random string
 */
export function randomString(length: number, charset?: string): string {
  const chars = charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}

/**
 * Generates a secure random number in a range.
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 * @returns Random number
 */
export function randomInt(min: number, max: number): number {
  const range = max - min;
  const bytes = crypto.randomBytes(4);
  const value = bytes.readUInt32BE(0);
  return min + (value % range);
}

/**
 * Creates a secure hash for comparison.
 *
 * @param data - Data to hash
 * @returns Hash suitable for secure comparison
 */
export function secureHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generates a digital signature for data.
 *
 * @param data - Data to sign
 * @param privateKey - Private key for signing
 * @returns Digital signature
 */
export function sign(data: string, privateKey: string): string {
  const signer = crypto.createSign('SHA256');
  signer.update(data);
  return signer.sign(privateKey, 'base64');
}

/**
 * Verifies a digital signature.
 *
 * @param data - Original data
 * @param signature - Signature to verify
 * @param publicKey - Public key for verification
 * @returns True if signature is valid
 */
export function verifySignature(data: string, signature: string, publicKey: string): boolean {
  const verifier = crypto.createVerify('SHA256');
  verifier.update(data);
  return verifier.verify(publicKey, signature, 'base64');
}

/**
 * Generates a key pair for asymmetric encryption.
 *
 * @returns Object containing public and private keys
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return { publicKey, privateKey };
}
